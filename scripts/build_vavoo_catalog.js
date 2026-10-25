const fs = require('fs');
const path = require('path');

const LANGUAGE_MAP = {
  'United Kingdom': 'en',
  'France': 'fr',
  'France Sport': 'fr',
  'Germany': 'de',
  'Spain': 'es',
  'Italy': 'it',
  'Turkey': 'tr',
  'Portugal': 'pt',
  'Poland': 'pl',
  'Balkans': 'sr',
  'Croatia': 'hr',
  'Albania': 'sq',
  'Romania': 'ro',
  'Bulgaria': 'bg',
  'Arabia': 'ar',
  'Russia': 'ru',
  'Netherlands': 'nl'
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildCatalog() {
  const auditPath = path.resolve(__dirname, '../docs/vavoo_all_channels_audit.json');
  if (!fs.existsSync(auditPath)) {
    console.error(`Audit file not found at ${auditPath}`);
    process.exit(1);
  }

  const rawAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const aliveList = rawAudit.aliveChannels || [];
  console.log(`Read ${aliveList.length} alive channels from audit.`);

  const seenUrls = new Set();
  const seenIds = new Set();
  const catalog = [];

  for (const ch of aliveList) {
    if (!ch.url || seenUrls.has(ch.url)) continue;
    seenUrls.add(ch.url);

    const name = String(ch.name || 'Unknown').trim();
    const group = String(ch.group || 'Other').trim();
    const language = LANGUAGE_MAP[group] || 'other';
    const is4k = /4k|uhd/i.test(name);

    let baseSlug = `${slugify(name)}-${slugify(group)}`;
    if (!baseSlug || baseSlug === '-') baseSlug = `ch-${catalog.length + 1}`;
    let finalId = baseSlug;
    let counter = 2;
    while (seenIds.has(finalId)) {
      finalId = `${baseSlug}-${counter}`;
      counter++;
    }
    seenIds.add(finalId);

    catalog.push({
      id: finalId,
      name,
      group,
      language,
      is4k,
      vavooUrl: ch.url
    });
  }

  console.log(`Generated ${catalog.length} unique deduplicated channels.`);

  const outPath = path.resolve(__dirname, '../src/data/vavoo_channels.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  console.log(`Catalog written to: ${outPath}`);

  // Breakdown summary
  const byGroup = {};
  let fourKCount = 0;
  for (const c of catalog) {
    byGroup[c.group] = (byGroup[c.group] || 0) + 1;
    if (c.is4k) fourKCount++;
  }

  console.log('\nCatalog Breakdown:');
  Object.entries(byGroup)
    .sort((a, b) => b[1] - a[1])
    .forEach(([grp, count]) => {
      console.log(`  - ${grp}: ${count} channels`);
    });
  console.log(`  - 4K / UHD Channels: ${fourKCount}`);
}

buildCatalog();
