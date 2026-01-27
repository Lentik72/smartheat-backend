// Clean the harvested emails CSV
// 1. Remove junk/placeholder emails
// 2. Fix malformed emails (trim suffix garbage)

const fs = require('fs');
const path = require('path');

const IN_FILE = path.join(__dirname, 'found_emails.csv');
const OUT_FILE = path.join(__dirname, 'found_emails_clean.csv');

// Junk patterns to completely remove
const JUNK_EMAILS = [
  'info@ndiscovered.com',
  'carolina@l4groupllc.com',
  'john@doe.com',
  'micah@micahrich.com',
  'info@gmail.com',
  'name@website.com',
  'thecarsedgesolutions@hotmail.com',
  'contact@mysite.com',
  'contacts@company.com',
  'hello@rfuenzalida.com',
  'eben@eyebytes.com',
  'info@ggoilct.com' // Wrong business for FJB Oil
];

// Malformed email fixes (captured -> corrected)
const MALFORMED_FIXES = {
  '374-1804emailjoesfuel14@gmail.comoffice': 'joesfuel14@gmail.com',
  'justoil2010@yahoo.comfrequently': 'justoil2010@yahoo.com',
  'redstaroil@verizon.netwelcome': 'redstaroil@verizon.net',
  'info@buxtonoil.comoffice': 'info@buxtonoil.com',
  'tripleafuel@gmail.comhoursmon': 'tripleafuel@gmail.com',
  '914.200.1224barrcofuel@gmail.comcall': 'barrcofuel@gmail.com',
  'coveredbrynmawrfuel@yahoo.comwestchester': 'brynmawrfuel@yahoo.com',
  'familyheating@optonline.netpermission': 'familyheating@optonline.net',
  'info@fuelnrg.cooffice': 'info@fuelnrg.co',
  '06479860-426-3720eazyoilllc@gmail.com': 'eazyoilllc@gmail.com',
  '06426860-664-5116skiesewetter58@gmail.com': 'skiesewetter58@gmail.com',
  'items.leblancoil34@gmail.com': 'leblancoil34@gmail.com' // weird prefix
};

const lines = fs.readFileSync(IN_FILE, 'utf8').split('\n');
const header = lines[0];
const dataLines = lines.slice(1).filter(l => l.trim());

let removed = 0;
let fixed = 0;
let kept = 0;

const cleanedLines = [header];

for (const line of dataLines) {
  // Extract email from CSV (6th field)
  const match = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
  if (!match) continue;

  const [_, id, name, city, state, website, email, source] = match;

  // Check if junk
  if (JUNK_EMAILS.includes(email.toLowerCase())) {
    console.log(`REMOVED: ${name} - ${email}`);
    removed++;
    continue;
  }

  // Check if needs fixing
  let cleanEmail = email;
  if (MALFORMED_FIXES[email]) {
    cleanEmail = MALFORMED_FIXES[email];
    console.log(`FIXED: ${name} - ${email} -> ${cleanEmail}`);
    fixed++;
  }

  // Rebuild CSV line
  const cleanLine = `"${id}","${name}","${city}","${state}","${website}","${cleanEmail}","${source}"`;
  cleanedLines.push(cleanLine);
  kept++;
}

fs.writeFileSync(OUT_FILE, cleanedLines.join('\n'));

console.log('\n=== CLEANING COMPLETE ===');
console.log(`Removed: ${removed}`);
console.log(`Fixed: ${fixed}`);
console.log(`Kept: ${kept}`);
console.log(`\nOutput: ${OUT_FILE}`);
