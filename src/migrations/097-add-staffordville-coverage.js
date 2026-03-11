/**
 * Migration 097: Add Staffordville (06077) Coverage
 *
 * Coverage gap: ZIP 06077 had 0 suppliers (missing from zip-database too).
 *
 * Add 06077 to postalCodesServed for 5 existing suppliers:
 * 1. Williams Fuel Oil (williamsfueloil.com) — ENABLED, Stafford Springs base
 * 2. Cashway Oil (cashwayoilct.com) — ENABLED, serves 06076
 * 3. Roberts Discount Fuel (robertsdiscountfuel.com) — DISABLED, lists Staffordville explicitly
 * 4. Trinks Brothers (trinksbrothers.com) — DISABLED, lists Stafford/Stafford Springs
 * 5. E-Z Oil (e-zoil.net) — ENABLED, lists Stafford (06075), Stafford Springs (06076)
 */

module.exports = {
  name: '097-add-staffordville-coverage',

  async up(sequelize) {
    const domains = [
      'williamsfueloil.com',
      'cashwayoilct.com',
      'robertsdiscountfuel.com',
      'trinksbrothers.com',
      'e-zoil.net',
    ];

    for (const domain of domains) {
      const [rows] = await sequelize.query(`
        SELECT id, name, postal_codes_served, service_cities
        FROM suppliers
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
        LIMIT 1
      `, { bind: [`%${domain}%`] });

      if (!rows || rows.length === 0) {
        console.log(`[Migration 097] Supplier matching ${domain} not found — skipping`);
        continue;
      }

      const supplier = rows[0];
      // JSONB columns return JS arrays directly; only parse if string
      let zips = Array.isArray(supplier.postal_codes_served)
        ? [...supplier.postal_codes_served]
        : (() => { try { return JSON.parse(supplier.postal_codes_served || '[]'); } catch (e) { return []; } })();
      let cities = Array.isArray(supplier.service_cities)
        ? [...supplier.service_cities]
        : (() => { try { return JSON.parse(supplier.service_cities || '[]'); } catch (e) { return []; } })();

      if (!zips.includes('06077')) zips.push('06077');
      if (!cities.includes('Staffordville')) cities.push('Staffordville');

      await sequelize.query(`
        UPDATE suppliers
        SET postal_codes_served = $1, service_cities = $2, updated_at = NOW()
        WHERE id = $3
      `, { bind: [JSON.stringify(zips), JSON.stringify(cities), supplier.id] });

      console.log(`[Migration 097] Updated ${supplier.name} — added 06077 (Staffordville)`);
    }

    console.log('[Migration 097] ✅ Staffordville coverage complete');
  },

  async down(sequelize) {
    const domains = [
      'williamsfueloil.com',
      'cashwayoilct.com',
      'robertsdiscountfuel.com',
      'trinksbrothers.com',
      'e-zoil.net',
    ];

    for (const domain of domains) {
      const [rows] = await sequelize.query(`
        SELECT id, postal_codes_served, service_cities
        FROM suppliers
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
        LIMIT 1
      `, { bind: [`%${domain}%`] });

      if (!rows || rows.length === 0) continue;

      const supplier = rows[0];
      // JSONB columns return JS arrays directly; only parse if string
      let zips = Array.isArray(supplier.postal_codes_served)
        ? [...supplier.postal_codes_served]
        : (() => { try { return JSON.parse(supplier.postal_codes_served || '[]'); } catch (e) { return []; } })();
      let cities = Array.isArray(supplier.service_cities)
        ? [...supplier.service_cities]
        : (() => { try { return JSON.parse(supplier.service_cities || '[]'); } catch (e) { return []; } })();

      zips = zips.filter(z => z !== '06077');
      cities = cities.filter(c => c !== 'Staffordville');

      await sequelize.query(`
        UPDATE suppliers
        SET postal_codes_served = $1, service_cities = $2, updated_at = NOW()
        WHERE id = $3
      `, { bind: [JSON.stringify(zips), JSON.stringify(cities), supplier.id] });
    }

    console.log('[Migration 097] Rollback: Removed 06077 from suppliers');
  }
};
