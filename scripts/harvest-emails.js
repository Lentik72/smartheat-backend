// scripts/harvest-emails.js
// Safe email harvester with CSV output for human review

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

// CONFIG
const DELAY_MS = 1500;
const OUT_FILE = path.join(__dirname, 'found_emails.csv');

const JUNK_DOMAINS = [
  'wix.com', 'wixpress.com', 'squarespace.com', 'wordpress.com', 'wordpress.org',
  'sentry.io', 'example.com', 'domain.com', 'email.com', 'test.com',
  'googleapis.com', 'google.com', 'facebook.com', 'twitter.com',
  'cloudflare.com', 'jsdelivr.net', 'wpengine.com', 'godaddy.com',
  'hostgator.com', 'bluehost.com', 'sitelock.com', 'sucuri.net',
  'schema.org', 'w3.org', 'gravatar.com', 'disqus.com'
];

const JUNK_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'admin', 'webmaster', 'postmaster', 'hostmaster',
  'privacy', 'abuse', 'support@wix', 'support@squarespace',
  'mailer-daemon', 'daemon', 'root', 'null'
];

const CONTACT_PATHS = ['/contact', '/contact-us', '/contactus', '/about', '/about-us'];

// DB
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function harvest() {
  console.log('🌾 Email Harvester - Safe Mode');
  console.log('================================\n');

  // Get suppliers with website but no email
  const [suppliers] = await sequelize.query(`
    SELECT id, name, website, city, state
    FROM suppliers
    WHERE active = true
      AND website IS NOT NULL
      AND website != ''
      AND (email IS NULL OR email = '')
    ORDER BY state, name
  `);

  console.log(`Found ${suppliers.length} suppliers to scan.\n`);

  // Write CSV header
  fs.writeFileSync(OUT_FILE, 'id,name,city,state,website,found_email,source_page\n');

  let foundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < suppliers.length; i++) {
    const s = suppliers[i];
    const progress = `[${i + 1}/${suppliers.length}]`;
    process.stdout.write(`${progress} ${s.name} (${s.state})... `);

    try {
      // Normalize URL - prefer HTTPS
      let baseUrl = s.website.trim();
      if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      // Remove trailing slash
      baseUrl = baseUrl.replace(/\/$/, '');

      // Try homepage first
      let result = await scanPage(baseUrl);

      // If no email on homepage, try contact pages
      if (!result.email) {
        for (const contactPath of CONTACT_PATHS) {
          const contactUrl = baseUrl + contactPath;
          result = await scanPage(contactUrl);
          if (result.email) {
            result.source = contactPath;
            break;
          }
        }
      }

      if (result.email) {
        console.log(`✅ ${result.email}`);
        // Escape CSV fields properly
        const row = [
          `"${s.id}"`,
          `"${s.name.replace(/"/g, '""')}"`,
          `"${s.city || ''}"`,
          `"${s.state}"`,
          `"${s.website}"`,
          `"${result.email}"`,
          `"${result.source || 'homepage'}"`
        ].join(',');
        fs.appendFileSync(OUT_FILE, row + '\n');
        foundCount++;
      } else {
        console.log('❌ No email found');
      }

    } catch (err) {
      console.log(`⚠️ Error: ${err.message.substring(0, 50)}`);
      errorCount++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n================================');
  console.log(`🌾 Harvest Complete!`);
  console.log(`   ✅ Found: ${foundCount} emails`);
  console.log(`   ❌ No email: ${suppliers.length - foundCount - errorCount}`);
  console.log(`   ⚠️ Errors: ${errorCount}`);
  console.log(`\n📄 Output: ${OUT_FILE}`);
  console.log(`\nNext: Review the CSV, then run: node scripts/import-emails.js`);

  await sequelize.close();
  process.exit(0);
}

async function scanPage(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const $ = cheerio.load(res.data);

    // Get text content and HTML (for mailto: links)
    const bodyText = $('body').text();
    const bodyHtml = res.data;

    // Email regex - be conservative
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const allMatches = (bodyText + ' ' + bodyHtml).match(emailRegex) || [];

    // Dedupe
    const unique = [...new Set(allMatches.map(e => e.toLowerCase()))];

    // Filter junk
    const valid = unique.filter(email => {
      // Check junk domains
      if (JUNK_DOMAINS.some(d => email.includes(d))) return false;
      // Check junk prefixes
      if (JUNK_PREFIXES.some(p => email.startsWith(p + '@') || email.startsWith(p))) return false;
      // Filter image filenames caught by regex
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(email)) return false;
      // Filter very short local parts (likely junk)
      const localPart = email.split('@')[0];
      if (localPart.length < 3) return false;
      // Filter if domain part looks wrong
      const domain = email.split('@')[1];
      if (!domain || domain.length < 4 || !domain.includes('.')) return false;

      return true;
    });

    if (valid.length === 0) {
      return { email: null };
    }

    // Score and sort - prioritize business-y emails
    valid.sort((a, b) => {
      const scoreEmail = (e) => {
        let score = 0;
        if (/^(info|sales|contact|hello|service|customer|office)@/.test(e)) score += 10;
        if (/^(billing|orders|support|help)@/.test(e)) score += 5;
        // Penalize generic-looking emails
        if (/^(test|demo|sample|user\d)@/.test(e)) score -= 10;
        return score;
      };
      return scoreEmail(b) - scoreEmail(a);
    });

    return { email: valid[0], source: null };

  } catch (err) {
    return { email: null, error: err.message };
  }
}

// Run
harvest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
