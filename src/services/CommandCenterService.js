/**
 * Command Center Service
 *
 * Intelligence layer for the dashboard Command Center tab.
 * Computes: North Star metric, anomaly detection with HDD normalization,
 * supplier lifecycle pipeline, and key movers.
 *
 * No new migrations — reads existing tables:
 *   supplier_clicks, suppliers, supplier_prices, weather_history,
 *   user_locations, supplier_engagements
 */

class CommandCenterService {
  /**
   * Get all Command Center data in parallel
   */
  async getData(sequelize, logger) {
    const [
      northStar,
      anomalies,
      lifecycle,
      movers,
      actionItems,
      trajectory,
      transitions,
      stability,
      marketPulse
    ] = await Promise.all([
      this._getNorthStar(sequelize).catch(e => {
        logger?.error('[CommandCenter] North Star error:', e.message);
        return { today: 0, yesterday: 0, change: 0, trend: [] };
      }),
      this._getAnomalies(sequelize, logger).catch(e => {
        logger?.error('[CommandCenter] Anomalies error:', e.message);
        return [];
      }),
      this._getSupplierLifecycle(sequelize).catch(e => {
        logger?.error('[CommandCenter] Lifecycle error:', e.message);
        return { states: {}, total: 0, pipelineTotal: 0, directoryTotal: 0, minimalTotal: 0, healthPct: 0 };
      }),
      this._getKeyMovers(sequelize).catch(e => {
        logger?.error('[CommandCenter] Movers error:', e.message);
        return { up: [], down: [] };
      }),
      this._getActionItems(sequelize).catch(e => {
        logger?.error('[CommandCenter] Actions error:', e.message);
        return [];
      }),
      this._getTrajectory(sequelize).catch(e => {
        logger?.error('[CommandCenter] Trajectory error:', e.message);
        return { direction: 'flat', pct: 0, days: 30 };
      }),
      this._getTransitions(sequelize).catch(e => {
        logger?.error('[CommandCenter] Transitions error:', e.message);
        return [];
      }),
      this._getStabilityScore(sequelize).catch(e => {
        logger?.error('[CommandCenter] Stability error:', e.message);
        return { score: 0, components: {} };
      }),
      this._getMarketPulse(sequelize).catch(e => {
        logger?.error('[CommandCenter] Market Pulse error:', e.message);
        return { medianPrice: [], demandVolume: [], scraperSuccess: [] };
      })
    ]);

    const diagnosis = this._buildDiagnosis(anomalies, northStar);
    const forecast = this._getForecast(northStar);

    return {
      northStar: { ...northStar, trajectory, forecast },
      anomalies,
      diagnosis,
      stability,
      lifecycle: { ...lifecycle, transitions },
      movers,
      actionItems,
      marketPulse,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * North Star: "Successful Supplier Connections per Day"
   * A click where the supplier has active status AND a fresh price (<48h scraped or <7d SMS)
   */
  async _getNorthStar(sequelize) {
    // Get daily quality connections for last 8 days (today + 7 for trend)
    const [dailyData] = await sequelize.query(`
      WITH fresh_suppliers AS (
        SELECT DISTINCT sp.supplier_id
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true
          AND s.active = true
          AND s.scrape_status = 'active'
          AND sp.scraped_at > NOW() - INTERVAL '48 hours'
      ),
      daily_connections AS (
        SELECT
          sc.created_at::date as day,
          COUNT(*) as total_clicks,
          COUNT(*) FILTER (WHERE fs.supplier_id IS NOT NULL) as quality_connections
        FROM supplier_clicks sc
        LEFT JOIN fresh_suppliers fs ON sc.supplier_id = fs.supplier_id
        WHERE sc.created_at > CURRENT_DATE - INTERVAL '8 days'
        GROUP BY sc.created_at::date
        ORDER BY day ASC
      )
      SELECT * FROM daily_connections
    `);

    // Parse into trend array
    const trend = [];
    let today = 0;
    let yesterday = 0;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    for (const row of dailyData) {
      const dayStr = new Date(row.day).toISOString().split('T')[0];
      const qc = parseInt(row.quality_connections) || 0;
      const tc = parseInt(row.total_clicks) || 0;
      trend.push({ date: dayStr, qualityConnections: qc, totalClicks: tc });
      if (dayStr === todayStr) today = qc;
      if (dayStr === yesterdayStr) yesterday = qc;
    }

    // 7-day average (excluding today)
    const pastDays = trend.filter(d => d.date !== todayStr);
    const avg7d = pastDays.length > 0
      ? Math.round(pastDays.reduce((s, d) => s + d.qualityConnections, 0) / pastDays.length)
      : 0;

    const change = avg7d > 0 ? Math.round(((today - avg7d) / avg7d) * 100) : 0;

    return {
      today,
      yesterday,
      avg7d,
      change,
      trend
    };
  }

  /**
   * Anomaly Detection across 5 categories
   * Compare today vs 7-day avg. Weather-normalize traffic using HDD.
   *
   * Categories: Traffic, Supply, Demand, Supplier, Conversion
   */
  async _getAnomalies(sequelize, logger) {
    const [dailyMetrics] = await sequelize.query(`
      WITH dates AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, '1 day')::date as day
      ),
      traffic AS (
        SELECT created_at::date as day, COUNT(*) as clicks
        FROM supplier_clicks
        WHERE created_at > CURRENT_DATE - INTERVAL '8 days'
        GROUP BY created_at::date
      ),
      supply AS (
        SELECT scraped_at::date as day, COUNT(DISTINCT supplier_id) as prices_scraped
        FROM supplier_prices
        WHERE scraped_at > CURRENT_DATE - INTERVAL '8 days'
          AND is_valid = true
        GROUP BY scraped_at::date
      ),
      demand AS (
        SELECT first_seen_at::date as day, COUNT(*) as new_locations
        FROM user_locations
        WHERE first_seen_at > CURRENT_DATE - INTERVAL '8 days'
        GROUP BY first_seen_at::date
      ),
      supplier_issues AS (
        SELECT
          d.val::timestamptz::date as day,
          COUNT(*) as failures
        FROM suppliers s,
        LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(s.scrape_failure_dates) = 'array'
               THEN s.scrape_failure_dates ELSE '[]'::jsonb END
        ) AS d(val)
        WHERE s.active = true
          AND d.val::timestamptz > CURRENT_DATE - INTERVAL '8 days'
        GROUP BY d.val::timestamptz::date
      ),
      weather AS (
        SELECT date as day, temp_avg
        FROM weather_history
        WHERE date > CURRENT_DATE - INTERVAL '8 days'
      )
      SELECT
        d.day,
        COALESCE(t.clicks, 0) as clicks,
        COALESCE(s.prices_scraped, 0) as prices_scraped,
        COALESCE(dm.new_locations, 0) as new_locations,
        COALESCE(si.failures, 0) as scrape_failures,
        w.temp_avg
      FROM dates d
      LEFT JOIN traffic t ON d.day = t.day
      LEFT JOIN supply s ON d.day = s.day
      LEFT JOIN demand dm ON d.day = dm.day
      LEFT JOIN supplier_issues si ON d.day = si.day
      LEFT JOIN weather w ON d.day = w.day
      ORDER BY d.day ASC
    `);

    const todayStr = new Date().toISOString().split('T')[0];
    const anomalies = [];

    // Separate today vs history
    const todayRow = dailyMetrics.find(r => new Date(r.day).toISOString().split('T')[0] === todayStr);
    const historyRows = dailyMetrics.filter(r => new Date(r.day).toISOString().split('T')[0] !== todayStr);

    if (!todayRow || historyRows.length < 3) return anomalies;

    // --- Traffic anomaly (HDD-normalized) ---
    const todayClicks = parseInt(todayRow.clicks) || 0;
    const todayTemp = todayRow.temp_avg ? parseFloat(todayRow.temp_avg) : null;
    const todayHDD = todayTemp !== null ? Math.max(0, 65 - todayTemp) : null;

    const histClicks = historyRows.map(r => parseInt(r.clicks) || 0);
    const avgClicks = histClicks.reduce((s, v) => s + v, 0) / histClicks.length;

    // Try HDD normalization
    let trafficDeviation;
    let trafficNote = '';
    if (todayHDD !== null && todayHDD > 0) {
      const histWithHDD = historyRows
        .filter(r => r.temp_avg !== null)
        .map(r => {
          const hdd = Math.max(0, 65 - parseFloat(r.temp_avg));
          const clicks = parseInt(r.clicks) || 0;
          return hdd > 0 ? clicks / hdd : null;
        })
        .filter(v => v !== null);

      if (histWithHDD.length >= 3) {
        const avgClicksPerHDD = histWithHDD.reduce((s, v) => s + v, 0) / histWithHDD.length;
        const todayClicksPerHDD = todayClicks / todayHDD;
        trafficDeviation = avgClicksPerHDD > 0
          ? Math.round(((todayClicksPerHDD - avgClicksPerHDD) / avgClicksPerHDD) * 100)
          : 0;
        trafficNote = 'Weather-normalized (HDD)';
      }
    }

    if (trafficDeviation === undefined) {
      trafficDeviation = avgClicks > 0
        ? Math.round(((todayClicks - avgClicks) / avgClicks) * 100)
        : 0;
    }

    if (Math.abs(trafficDeviation) > 25 && todayClicks >= 5) {
      anomalies.push({
        category: 'traffic',
        title: 'Traffic',
        today: todayClicks,
        avg7d: Math.round(avgClicks),
        deviation: trafficDeviation,
        direction: trafficDeviation > 0 ? 'up' : 'down',
        severity: Math.abs(trafficDeviation) > 50 ? 'high' : 'medium',
        note: trafficNote,
        insight: trafficDeviation > 0
          ? `Clicks are ${trafficDeviation}% above normal${trafficNote ? ' (after weather adjustment)' : ''}`
          : `Clicks are ${Math.abs(trafficDeviation)}% below normal${trafficNote ? ' (after weather adjustment)' : ''}`
      });
    }

    // --- Supply anomaly ---
    const todaySupply = parseInt(todayRow.prices_scraped) || 0;
    const histSupply = historyRows.map(r => parseInt(r.prices_scraped) || 0);
    const avgSupply = histSupply.reduce((s, v) => s + v, 0) / histSupply.length;
    const supplyDev = avgSupply > 0 ? Math.round(((todaySupply - avgSupply) / avgSupply) * 100) : 0;

    if (Math.abs(supplyDev) > 20 && avgSupply >= 3) {
      anomalies.push({
        category: 'supply',
        title: 'Price Supply',
        today: todaySupply,
        avg7d: Math.round(avgSupply),
        deviation: supplyDev,
        direction: supplyDev > 0 ? 'up' : 'down',
        severity: supplyDev < -30 ? 'high' : 'medium',
        insight: supplyDev < 0
          ? `Only ${todaySupply} suppliers scraped today vs ${Math.round(avgSupply)} avg — check scraper health`
          : `${todaySupply} suppliers scraped today, ${supplyDev}% above average`
      });
    }

    // --- Demand anomaly ---
    const todayDemand = parseInt(todayRow.new_locations) || 0;
    const histDemand = historyRows.map(r => parseInt(r.new_locations) || 0);
    const avgDemand = histDemand.reduce((s, v) => s + v, 0) / histDemand.length;
    const demandDev = avgDemand > 0 ? Math.round(((todayDemand - avgDemand) / avgDemand) * 100) : 0;

    if (Math.abs(demandDev) > 30 && (todayDemand >= 3 || avgDemand >= 3)) {
      anomalies.push({
        category: 'demand',
        title: 'New Demand',
        today: todayDemand,
        avg7d: Math.round(avgDemand),
        deviation: demandDev,
        direction: demandDev > 0 ? 'up' : 'down',
        severity: Math.abs(demandDev) > 60 ? 'high' : 'medium',
        insight: demandDev > 0
          ? `${todayDemand} new ZIP locations today — demand surge, check coverage gaps`
          : `New user locations down ${Math.abs(demandDev)}% from average`
      });
    }

    // --- Supplier failures anomaly ---
    const todayFails = parseInt(todayRow.scrape_failures) || 0;
    const histFails = historyRows.map(r => parseInt(r.scrape_failures) || 0);
    const avgFails = histFails.reduce((s, v) => s + v, 0) / histFails.length;
    const failDev = avgFails > 0 ? Math.round(((todayFails - avgFails) / avgFails) * 100) : 0;

    if (todayFails > avgFails + 2 && todayFails >= 3) {
      anomalies.push({
        category: 'supplier',
        title: 'Scrape Failures',
        today: todayFails,
        avg7d: Math.round(avgFails),
        deviation: failDev,
        direction: 'up',
        severity: todayFails > avgFails * 2 ? 'high' : 'medium',
        insight: `${todayFails} scrape failures today vs ${Math.round(avgFails)} avg — suppliers may be blocking`
      });
    }

    // --- Conversion anomaly (quality connection rate) ---
    // Reuse North Star logic: what % of clicks hit fresh-price suppliers
    const [convData] = await sequelize.query(`
      WITH fresh AS (
        SELECT DISTINCT sp.supplier_id
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true AND s.active = true
          AND sp.scraped_at > NOW() - INTERVAL '48 hours'
      )
      SELECT
        sc.created_at::date as day,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE f.supplier_id IS NOT NULL) as quality
      FROM supplier_clicks sc
      LEFT JOIN fresh f ON sc.supplier_id = f.supplier_id
      WHERE sc.created_at > CURRENT_DATE - INTERVAL '8 days'
      GROUP BY sc.created_at::date
      ORDER BY day ASC
    `);

    const todayConv = convData.find(r => new Date(r.day).toISOString().split('T')[0] === todayStr);
    const histConv = convData.filter(r => new Date(r.day).toISOString().split('T')[0] !== todayStr);

    if (todayConv && histConv.length >= 3) {
      const todayRate = parseInt(todayConv.total) > 0
        ? Math.round((parseInt(todayConv.quality) / parseInt(todayConv.total)) * 100) : 0;
      const histRates = histConv.map(r =>
        parseInt(r.total) > 0 ? (parseInt(r.quality) / parseInt(r.total)) * 100 : 0
      );
      const avgRate = Math.round(histRates.reduce((s, v) => s + v, 0) / histRates.length);
      const convDev = avgRate > 0 ? Math.round(((todayRate - avgRate) / avgRate) * 100) : 0;

      if (Math.abs(convDev) > 20 && parseInt(todayConv.total) >= 5) {
        anomalies.push({
          category: 'conversion',
          title: 'Connection Quality',
          today: todayRate + '%',
          avg7d: avgRate + '%',
          deviation: convDev,
          direction: convDev > 0 ? 'up' : 'down',
          severity: convDev < -30 ? 'high' : 'medium',
          insight: convDev < 0
            ? `Only ${todayRate}% of clicks hit suppliers with fresh prices (normally ${avgRate}%)`
            : `${todayRate}% quality connection rate — above the ${avgRate}% average`
        });
      }
    }

    return anomalies;
  }

  /**
   * Supplier Health — tier-based classification
   * Pipeline (allow_price_display=true + website): live, stale, failing, blocked
   * Directory (website but !allow_price_display): listed
   * Minimal (no website): minimal
   */
  async _getSupplierLifecycle(sequelize) {
    const [results] = await sequelize.query(`
      WITH latest_prices AS (
        SELECT DISTINCT ON (supplier_id)
          supplier_id,
          scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT
        s.id, s.name, s.city, s.state, s.scrape_status,
        s.consecutive_scrape_failures, s.website, s.allow_price_display,
        lp.scraped_at as last_price_at,
        CASE
          WHEN s.allow_price_display = true AND s.website IS NOT NULL AND s.website != '' THEN
            CASE
              WHEN s.scrape_status IN ('cooldown', 'phone_only') THEN 'blocked'
              WHEN s.consecutive_scrape_failures >= 1 AND s.scrape_status = 'active' THEN 'failing'
              WHEN lp.scraped_at IS NOT NULL AND lp.scraped_at < NOW() - INTERVAL '48 hours' THEN 'stale'
              WHEN lp.scraped_at IS NOT NULL AND lp.scraped_at >= NOW() - INTERVAL '48 hours' THEN 'live'
              ELSE 'stale'
            END
          WHEN s.website IS NOT NULL AND s.website != '' THEN 'listed'
          ELSE 'minimal'
        END as lifecycle_state
      FROM suppliers s
      LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
      WHERE s.active = true
    `);

    // Count by state with richer examples
    const states = { live: 0, stale: 0, failing: 0, blocked: 0, listed: 0, minimal: 0 };
    const examples = { live: [], stale: [], failing: [], blocked: [], listed: [], minimal: [] };

    for (const r of results) {
      const state = r.lifecycle_state;
      states[state] = (states[state] || 0) + 1;
      if (examples[state] && examples[state].length < 5) {
        examples[state].push({
          name: r.name,
          city: r.city,
          state: r.state,
          website: r.website || null,
          failures: parseInt(r.consecutive_scrape_failures) || 0,
          lastPrice: r.last_price_at || null
        });
      }
    }

    const pipelineTotal = states.live + states.stale + states.failing + states.blocked;
    const directoryTotal = states.listed;
    const minimalTotal = states.minimal;
    const healthPct = pipelineTotal > 0 ? Math.round((states.live / pipelineTotal) * 100) : 0;

    return {
      states,
      total: results.length,
      pipelineTotal,
      directoryTotal,
      minimalTotal,
      healthPct,
      examples
    };
  }

  /**
   * Key Movers: Suppliers with biggest price changes (last 24h vs previous)
   */
  async _getKeyMovers(sequelize) {
    // Get each supplier's latest price and their second-latest price, then diff
    const [results] = await sequelize.query(`
      WITH ranked AS (
        SELECT
          supplier_id,
          price_per_gallon,
          scraped_at,
          ROW_NUMBER() OVER (PARTITION BY supplier_id ORDER BY scraped_at DESC) as rn
        FROM supplier_prices
        WHERE is_valid = true
          AND scraped_at > NOW() - INTERVAL '7 days'
      ),
      current_prices AS (
        SELECT supplier_id, price_per_gallon as current_price, scraped_at
        FROM ranked WHERE rn = 1
      ),
      prev_prices AS (
        SELECT supplier_id, price_per_gallon as prev_price
        FROM ranked WHERE rn = 2
      )
      SELECT
        s.name,
        s.city,
        s.state,
        c.current_price,
        p.prev_price,
        (c.current_price - p.prev_price) as price_change,
        CASE WHEN p.prev_price > 0
          THEN ROUND(((c.current_price - p.prev_price) / p.prev_price * 100)::numeric, 1)
          ELSE 0
        END as pct_change,
        c.scraped_at
      FROM current_prices c
      JOIN prev_prices p ON c.supplier_id = p.supplier_id
      JOIN suppliers s ON c.supplier_id = s.id
      WHERE ABS(c.current_price - p.prev_price) > 0.01
      ORDER BY ABS(c.current_price - p.prev_price) DESC
      LIMIT 10
    `);

    const up = [];
    const down = [];

    for (const r of results) {
      const change = parseFloat(r.price_change);
      const entry = {
        name: r.name,
        city: r.city,
        state: r.state,
        currentPrice: parseFloat(r.current_price),
        prevPrice: parseFloat(r.prev_price),
        change: Math.round(change * 100) / 100,
        pctChange: parseFloat(r.pct_change) || 0
      };
      if (change > 0) up.push(entry);
      else down.push(entry);
    }

    return { up, down };
  }

  /**
   * Action Items: auto-generated from current state
   */
  async _getActionItems(sequelize) {
    const actions = [];

    // Cooldown suppliers — include names + websites for action
    const [cooldowns] = await sequelize.query(`
      SELECT name, city, state, website, consecutive_scrape_failures as failures
      FROM suppliers
      WHERE active = true AND scrape_status = 'cooldown'
      ORDER BY consecutive_scrape_failures DESC
    `);
    if (cooldowns.length > 0) {
      actions.push({
        priority: 'high',
        label: 'CRITICAL',
        type: 'supplier',
        text: `Restore ${cooldowns.length} cooldown supplier${cooldowns.length > 1 ? 's' : ''}`,
        impact: `+${cooldowns.length * 2}\u2013${cooldowns.length * 4} quality clicks/day if restored`,
        metric: cooldowns.length,
        details: cooldowns.map(r => ({
          name: r.name,
          location: `${r.city}, ${r.state}`,
          website: r.website,
          note: `${r.failures} consecutive failures`
        }))
      });
    }

    // Uncovered demand — include actual ZIP codes
    const [uncovered] = await sequelize.query(`
      SELECT zip_code, city, state, request_count
      FROM user_locations
      WHERE coverage_quality IN ('none', 'low')
        AND first_seen_at > NOW() - INTERVAL '7 days'
      ORDER BY request_count DESC
      LIMIT 10
    `);
    if (uncovered.length > 0) {
      actions.push({
        priority: 'medium',
        label: 'OPPORTUNITY',
        type: 'coverage',
        text: `Add suppliers for ${uncovered.length} underserved ZIP${uncovered.length > 1 ? 's' : ''}`,
        impact: `${uncovered.length} searches with no supply`,
        metric: uncovered.length,
        details: uncovered.map(r => ({
          name: r.zip_code,
          location: `${r.city || ''}, ${r.state || ''}`.replace(/^, |, $/, ''),
          note: `${r.request_count || 1} searches`
        }))
      });
    }

    // Stale prices — include supplier names + how stale
    const [stale] = await sequelize.query(`
      WITH latest AS (
        SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT s.name, s.city, s.state, s.website,
        ROUND(EXTRACT(EPOCH FROM (NOW() - l.scraped_at)) / 86400) as days_stale
      FROM suppliers s
      JOIN latest l ON s.id = l.supplier_id
      WHERE s.active = true AND s.allow_price_display = true
        AND s.website IS NOT NULL AND s.website != ''
        AND l.scraped_at < NOW() - INTERVAL '48 hours'
      ORDER BY l.scraped_at ASC
      LIMIT 15
    `);
    if (stale.length > 3) {
      actions.push({
        priority: 'medium',
        label: 'MAINTENANCE',
        type: 'data',
        text: `${stale.length} stale prices > 48h`,
        impact: 'Suppressing conversion rate',
        metric: stale.length,
        details: stale.map(r => ({
          name: r.name,
          location: `${r.city}, ${r.state}`,
          website: r.website,
          note: `${r.days_stale}d stale`
        }))
      });
    }

    // At-risk suppliers — include names
    const [atRisk] = await sequelize.query(`
      SELECT name, city, state, website, last_scrape_failure_at
      FROM suppliers
      WHERE active = true AND scrape_status = 'active'
        AND consecutive_scrape_failures = 1
      ORDER BY last_scrape_failure_at DESC
    `);
    if (atRisk.length > 0) {
      actions.push({
        priority: 'low',
        label: 'WARNING',
        type: 'supplier',
        text: `${atRisk.length} supplier${atRisk.length > 1 ? 's' : ''} at risk (1 failure from cooldown)`,
        impact: `Could lose ${atRisk.length} price sources`,
        metric: atRisk.length,
        details: atRisk.map(r => ({
          name: r.name,
          location: `${r.city}, ${r.state}`,
          website: r.website
        }))
      });
    }

    return actions.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] || 2) - (p[b.priority] || 2);
    });
  }

  /**
   * 30-day trajectory: is the North Star trending up, down, or flat?
   * Compares last 7d average vs previous 7d average within a 30d window
   */
  async _getTrajectory(sequelize) {
    const [results] = await sequelize.query(`
      WITH fresh_suppliers AS (
        SELECT DISTINCT sp.supplier_id
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true AND s.active = true
          AND sp.scraped_at > NOW() - INTERVAL '48 hours'
      ),
      daily AS (
        SELECT
          sc.created_at::date as day,
          COUNT(*) FILTER (WHERE fs.supplier_id IS NOT NULL) as qc
        FROM supplier_clicks sc
        LEFT JOIN fresh_suppliers fs ON sc.supplier_id = fs.supplier_id
        WHERE sc.created_at > CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sc.created_at::date
      )
      SELECT
        AVG(qc) FILTER (WHERE day > CURRENT_DATE - INTERVAL '7 days') as recent_avg,
        AVG(qc) FILTER (WHERE day <= CURRENT_DATE - INTERVAL '7 days'
                           AND day > CURRENT_DATE - INTERVAL '14 days') as prev_avg,
        AVG(qc) as month_avg
      FROM daily
    `);

    const row = results[0] || {};
    const recent = parseFloat(row.recent_avg) || 0;
    const prev = parseFloat(row.prev_avg) || 0;
    const monthAvg = parseFloat(row.month_avg) || 0;
    const pct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : 0;

    let direction = 'flat';
    if (pct > 10) direction = 'up';
    else if (pct < -10) direction = 'down';

    return { direction, pct, recentAvg: Math.round(recent), prevAvg: Math.round(prev), monthAvg: Math.round(monthAvg) };
  }

  /**
   * Pipeline transitions this week (pipeline-only: allow_price_display=true + website)
   */
  async _getTransitions(sequelize) {
    const transitions = [];
    const pipelineFilter = `s.active = true AND s.allow_price_display = true AND s.website IS NOT NULL AND s.website != ''`;

    // Became blocked this week (entered cooldown/phone_only)
    const [blocked] = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM suppliers s
      WHERE ${pipelineFilter}
        AND s.scrape_status IN ('cooldown', 'phone_only')
        AND s.last_scrape_failure_at >= NOW() - INTERVAL '7 days'
    `);
    const newBlocked = parseInt(blocked[0]?.cnt) || 0;
    if (newBlocked > 0) {
      transitions.push({ label: `${newBlocked} became blocked`, direction: 'down', count: newBlocked });
    }

    // Went live this week (first price in last 7 days, no price before that)
    const [wentLive] = await sequelize.query(`
      SELECT COUNT(DISTINCT sp.supplier_id) as cnt
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE sp.is_valid = true
        AND ${pipelineFilter}
        AND s.scrape_status = 'active'
        AND sp.scraped_at > NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_prices sp2
          WHERE sp2.supplier_id = sp.supplier_id
            AND sp2.is_valid = true
            AND sp2.scraped_at <= NOW() - INTERVAL '7 days'
            AND sp2.scraped_at > NOW() - INTERVAL '14 days'
        )
    `);
    const liveCount = parseInt(wentLive[0]?.cnt) || 0;
    if (liveCount > 0) {
      transitions.push({ label: `${liveCount} went live`, direction: 'up', count: liveCount });
    }

    // Went stale this week (last price 48h–9d ago, meaning it was fresh last week)
    const [wentStale] = await sequelize.query(`
      WITH latest AS (
        SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
        FROM supplier_prices WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT COUNT(*) as cnt FROM latest l
      JOIN suppliers s ON l.supplier_id = s.id
      WHERE ${pipelineFilter}
        AND l.scraped_at < NOW() - INTERVAL '48 hours'
        AND l.scraped_at > NOW() - INTERVAL '9 days'
    `);
    const staleCount = parseInt(wentStale[0]?.cnt) || 0;
    if (staleCount > 0) {
      transitions.push({ label: `${staleCount} went stale`, direction: 'down', count: staleCount });
    }

    return transitions;
  }

  /**
   * Build diagnosis from anomalies — finds primary driver and confidence
   */
  _buildDiagnosis(anomalies, northStar) {
    if (!anomalies.length) {
      return {
        status: 'normal',
        primaryCause: null,
        confidence: null,
        summary: 'All systems operating normally'
      };
    }

    // Sort by severity (high first) then by absolute deviation
    const sorted = [...anomalies].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return Math.abs(b.deviation) - Math.abs(a.deviation);
    });

    const primary = sorted[0];

    // Build causal chain
    const causeMap = {
      supply: 'Supply collapse (scraper failure or site changes)',
      demand: 'Demand shift (user traffic change)',
      traffic: 'Traffic anomaly',
      supplier: 'Supplier infrastructure issues (scrape failures)',
      conversion: 'Conversion degradation (stale or missing prices)'
    };

    // Confidence based on data completeness and anomaly clarity
    let confidence = 70;
    if (anomalies.length === 1) confidence += 15; // Clear single cause
    if (Math.abs(primary.deviation) > 50) confidence += 10; // Strong signal
    if (primary.severity === 'high') confidence += 5;
    confidence = Math.min(confidence, 98);

    // Check for linked anomalies (supply → conversion → connections)
    const hasSupplyIssue = anomalies.some(a => a.category === 'supply' && a.deviation < -30);
    const hasConversionIssue = anomalies.some(a => a.category === 'conversion');
    let linkedExplanation = '';
    if (hasSupplyIssue && hasConversionIssue) {
      linkedExplanation = ' Supply failure is cascading to conversion quality.';
      confidence = Math.min(confidence + 5, 98);
    }

    return {
      status: primary.severity === 'high' ? 'critical' : 'warning',
      primaryCause: causeMap[primary.category] || primary.title,
      confidence,
      summary: primary.insight + (linkedExplanation || ''),
      category: primary.category
    };
  }
  /**
   * Stability Score: composite 0-100 from 4 weighted components
   * Supply Freshness (30%): % of scrapable suppliers with price <48h
   * Scraper Uptime (25%): % of suppliers in active status
   * Conversion Rate (25%): quality connection rate today
   * Demand Velocity (20%): today vs 7d daily avg
   */
  async _getStabilityScore(sequelize) {
    const [[freshData], [uptimeData], [convData], [demandData]] = await Promise.all([
      sequelize.query(`
        WITH scrapable AS (
          SELECT id FROM suppliers WHERE active = true AND website IS NOT NULL AND website != ''
        ),
        fresh AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
          FROM supplier_prices WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT
          (SELECT COUNT(*) FROM scrapable) as total,
          COUNT(*) as fresh
        FROM scrapable s
        JOIN fresh f ON s.id = f.supplier_id
        WHERE f.scraped_at > NOW() - INTERVAL '48 hours'
      `),
      sequelize.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE scrape_status = 'active') as active
        FROM suppliers
        WHERE active = true AND website IS NOT NULL AND website != ''
      `),
      sequelize.query(`
        WITH fresh_sup AS (
          SELECT DISTINCT sp.supplier_id
          FROM supplier_prices sp
          JOIN suppliers s ON sp.supplier_id = s.id
          WHERE sp.is_valid = true AND s.active = true
            AND sp.scraped_at > NOW() - INTERVAL '48 hours'
        )
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE fs.supplier_id IS NOT NULL) as quality
        FROM supplier_clicks sc
        LEFT JOIN fresh_sup fs ON sc.supplier_id = fs.supplier_id
        WHERE sc.created_at > CURRENT_DATE
      `),
      sequelize.query(`
        SELECT
          (SELECT COUNT(*) FROM user_locations WHERE first_seen_at::date = CURRENT_DATE) as today,
          (SELECT COUNT(*)::float / 7 FROM user_locations
           WHERE first_seen_at >= CURRENT_DATE - INTERVAL '7 days'
             AND first_seen_at < CURRENT_DATE) as daily_avg
      `)
    ]);

    const total = parseInt(freshData[0]?.total) || 1;
    const fresh = parseInt(freshData[0]?.fresh) || 0;
    const supplyFreshness = Math.round((fresh / total) * 100);

    const uptimeTotal = parseInt(uptimeData[0]?.total) || 1;
    const uptimeActive = parseInt(uptimeData[0]?.active) || 0;
    const scraperUptime = Math.round((uptimeActive / uptimeTotal) * 100);

    const convTotal = parseInt(convData[0]?.total) || 0;
    const convQuality = parseInt(convData[0]?.quality) || 0;
    const conversionRate = convTotal > 0 ? Math.round((convQuality / convTotal) * 100) : 50;

    const demToday = parseInt(demandData[0]?.today) || 0;
    const demAvg = parseFloat(demandData[0]?.daily_avg) || 0.5;
    const demandVelocity = Math.min(100, Math.round((demToday / Math.max(demAvg, 0.5)) * 100));

    const score = Math.round(
      supplyFreshness * 0.30 +
      scraperUptime * 0.25 +
      conversionRate * 0.25 +
      demandVelocity * 0.20
    );

    return {
      score: Math.min(100, Math.max(0, score)),
      components: { supplyFreshness, scraperUptime, conversionRate, demandVelocity }
    };
  }

  /**
   * Simple linear forecast from last 3 complete days
   */
  _getForecast(northStar) {
    const trend = northStar.trend || [];
    if (trend.length < 3) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const complete = trend.filter(d => d.date !== todayStr);
    const recent = complete.slice(-3);
    if (recent.length < 2) return null;

    const values = recent.map(d => d.qualityConnections);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const last = values[values.length - 1];
    const first = values[0];
    const dailyDelta = (last - first) / (values.length - 1);
    const projected = Math.max(0, Math.round(last + dailyDelta));

    const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
    const confidence = cv < 0.2 ? 'high' : cv < 0.5 ? 'medium' : 'low';

    return { projected, confidence };
  }

  /**
   * Market Pulse: 3 trend series for mini charts
   * 1. Median price (30d), 2. Demand volume (30d), 3. Scraper success (14d)
   */
  async _getMarketPulse(sequelize) {
    const [medianPrices, demandVolume, scraperSuccess] = await Promise.all([
      sequelize.query(`
        SELECT scraped_at::date as day,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_gallon) as median_price
        FROM supplier_prices
        WHERE is_valid = true AND scraped_at > CURRENT_DATE - INTERVAL '30 days'
        GROUP BY scraped_at::date
        ORDER BY day ASC
      `).then(([r]) => r),

      sequelize.query(`
        SELECT first_seen_at::date as day, COUNT(*) as count
        FROM user_locations
        WHERE first_seen_at > CURRENT_DATE - INTERVAL '30 days'
        GROUP BY first_seen_at::date
        ORDER BY day ASC
      `).then(([r]) => r),

      sequelize.query(`
        WITH daily_success AS (
          SELECT scraped_at::date as day, COUNT(DISTINCT supplier_id) as successes
          FROM supplier_prices
          WHERE is_valid = true AND scraped_at > CURRENT_DATE - INTERVAL '14 days'
          GROUP BY scraped_at::date
        ),
        daily_failures AS (
          SELECT d.val::timestamptz::date as day, COUNT(*) as failures
          FROM suppliers s,
          LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(s.scrape_failure_dates) = 'array'
                 THEN s.scrape_failure_dates ELSE '[]'::jsonb END
          ) AS d(val)
          WHERE s.active = true
            AND d.val::timestamptz > CURRENT_DATE - INTERVAL '14 days'
          GROUP BY d.val::timestamptz::date
        )
        SELECT
          COALESCE(s.day, f.day) as day,
          COALESCE(s.successes, 0) as successes,
          COALESCE(f.failures, 0) as failures
        FROM daily_success s
        FULL OUTER JOIN daily_failures f ON s.day = f.day
        ORDER BY day ASC
      `).then(([r]) => r)
    ]);

    return {
      medianPrice: medianPrices.map(r => ({
        date: new Date(r.day).toISOString().split('T')[0],
        value: Math.round(parseFloat(r.median_price) * 100) / 100
      })),
      demandVolume: demandVolume.map(r => ({
        date: new Date(r.day).toISOString().split('T')[0],
        value: parseInt(r.count) || 0
      })),
      scraperSuccess: scraperSuccess.map(r => {
        const s = parseInt(r.successes) || 0;
        const f = parseInt(r.failures) || 0;
        const total = s + f;
        return {
          date: new Date(r.day).toISOString().split('T')[0],
          value: total > 0 ? Math.round((s / total) * 100) : 100
        };
      })
    };
  }
}

module.exports = CommandCenterService;
