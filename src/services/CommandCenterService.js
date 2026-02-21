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
      actionItems
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
        return { states: {}, transitions: [] };
      }),
      this._getKeyMovers(sequelize).catch(e => {
        logger?.error('[CommandCenter] Movers error:', e.message);
        return { up: [], down: [] };
      }),
      this._getActionItems(sequelize).catch(e => {
        logger?.error('[CommandCenter] Actions error:', e.message);
        return [];
      })
    ]);

    return {
      northStar,
      anomalies,
      lifecycle,
      movers,
      actionItems,
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
   * Supplier Lifecycle Pipeline
   * States: newLead, active, stale, atRisk, cooldown, dormant
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
      ),
      scrapable AS (
        SELECT
          s.id,
          s.name,
          s.city,
          s.state,
          s.scrape_status,
          s.consecutive_scrape_failures,
          s.created_at,
          s.active,
          s.website,
          s.allow_price_display,
          lp.scraped_at as last_price_at
        FROM suppliers s
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        WHERE s.active = true
      )
      SELECT
        id, name, city, state, scrape_status,
        consecutive_scrape_failures,
        created_at, website, allow_price_display,
        last_price_at,
        CASE
          WHEN scrape_status IN ('cooldown') THEN 'cooldown'
          WHEN scrape_status = 'phone_only' THEN 'dormant'
          WHEN website IS NULL OR website = '' THEN 'dormant'
          WHEN consecutive_scrape_failures >= 1 AND scrape_status = 'active' THEN 'atRisk'
          WHEN last_price_at IS NOT NULL AND last_price_at < NOW() - INTERVAL '48 hours' THEN 'stale'
          WHEN last_price_at IS NOT NULL AND last_price_at >= NOW() - INTERVAL '48 hours' THEN 'active'
          WHEN last_price_at IS NULL AND created_at > NOW() - INTERVAL '30 days' THEN 'newLead'
          ELSE 'dormant'
        END as lifecycle_state
      FROM scrapable
    `);

    // Count by state
    const states = { newLead: 0, active: 0, stale: 0, atRisk: 0, cooldown: 0, dormant: 0 };
    const examples = { newLead: [], active: [], stale: [], atRisk: [], cooldown: [], dormant: [] };

    for (const r of results) {
      const state = r.lifecycle_state;
      states[state] = (states[state] || 0) + 1;
      if (examples[state] && examples[state].length < 3) {
        examples[state].push({
          name: r.name,
          city: r.city,
          state: r.state
        });
      }
    }

    return {
      states,
      total: results.length,
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

    // Check for cooldown suppliers that might be recoverable
    const [cooldowns] = await sequelize.query(`
      SELECT COUNT(*) as cnt
      FROM suppliers
      WHERE active = true AND scrape_status = 'cooldown'
    `);
    const cooldownCount = parseInt(cooldowns[0]?.cnt) || 0;
    if (cooldownCount > 0) {
      actions.push({
        priority: 'high',
        type: 'supplier',
        text: `${cooldownCount} supplier${cooldownCount > 1 ? 's' : ''} in cooldown — review scrape configs`,
        metric: cooldownCount
      });
    }

    // Check for uncovered demand
    const [uncovered] = await sequelize.query(`
      SELECT COUNT(*) as cnt
      FROM user_locations
      WHERE coverage_quality IN ('none', 'low')
        AND first_seen_at > NOW() - INTERVAL '7 days'
    `);
    const uncoveredCount = parseInt(uncovered[0]?.cnt) || 0;
    if (uncoveredCount > 0) {
      actions.push({
        priority: 'medium',
        type: 'coverage',
        text: `${uncoveredCount} new ZIP${uncoveredCount > 1 ? 's' : ''} with poor coverage this week`,
        metric: uncoveredCount
      });
    }

    // Check for stale prices
    const [stale] = await sequelize.query(`
      WITH latest AS (
        SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT COUNT(*) as cnt
      FROM suppliers s
      JOIN latest l ON s.id = l.supplier_id
      WHERE s.active = true
        AND s.website IS NOT NULL AND s.website != ''
        AND l.scraped_at < NOW() - INTERVAL '48 hours'
    `);
    const staleCount = parseInt(stale[0]?.cnt) || 0;
    if (staleCount > 3) {
      actions.push({
        priority: 'medium',
        type: 'data',
        text: `${staleCount} suppliers have stale prices (>48h) — check Health tab`,
        metric: staleCount
      });
    }

    // Check for at-risk suppliers
    const [atRisk] = await sequelize.query(`
      SELECT COUNT(*) as cnt
      FROM suppliers
      WHERE active = true AND scrape_status = 'active'
        AND consecutive_scrape_failures = 1
    `);
    const atRiskCount = parseInt(atRisk[0]?.cnt) || 0;
    if (atRiskCount > 0) {
      actions.push({
        priority: 'low',
        type: 'supplier',
        text: `${atRiskCount} supplier${atRiskCount > 1 ? 's' : ''} at risk of cooldown (1 failure away)`,
        metric: atRiskCount
      });
    }

    return actions.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] || 2) - (p[b.priority] || 2);
    });
  }
}

module.exports = CommandCenterService;
