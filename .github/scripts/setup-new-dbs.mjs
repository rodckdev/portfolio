#!/usr/bin/env node
// setup-new-dbs.mjs — cria SOMENTE os 2 DBs novos introduzidos no PR do CV
// dinâmico:
//   - Site KPIs           (alimenta hero.metrics + cv.kpis)
//   - Site CV Highlights  (alimenta cv.deliverables)
//
// Use este script quando você JÁ rodou `setup-site-dbs.mjs` antes (os 5 DBs
// originais já existem) e não quer criar duplicatas. Seed do site.json atual
// é feito automaticamente (passe --no-seed para pular).
//
// Uso:
//   export NOTION_API_KEY=ntn_...
//   export NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   node .github/scripts/setup-new-dbs.mjs          # cria + seed
//   node .github/scripts/setup-new-dbs.mjs --no-seed

import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const PARENT_ID = process.env.NOTION_PARENT_PAGE_ID;
const SEED = !process.argv.includes('--no-seed');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SITE_JSON = path.join(ROOT, 'assets/data/site.json');

if (!NOTION_API_KEY || !PARENT_ID) {
  console.error(
    'Uso: NOTION_API_KEY=... NOTION_PARENT_PAGE_ID=... node .github/scripts/setup-new-dbs.mjs [--no-seed]',
  );
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

const SCHEMAS = {
  'Site KPIs': {
    Name: { title: {} },
    Value: { rich_text: {} },
    HeroOrder: { number: {} },
    CvOrder: { number: {} },
    Published: { checkbox: {} },
  },
  'Site CV Highlights': {
    Name: { title: {} },
    Detail: { rich_text: {} },
    Order: { number: {} },
    Published: { checkbox: {} },
  },
};

async function main() {
  console.log(`[setup-new-dbs] parent page = ${PARENT_ID}`);
  const ids = {};
  for (const [title, properties] of Object.entries(SCHEMAS)) {
    const db = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_ID },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    });
    ids[title] = db.id;
    console.log(`[setup-new-dbs] criado "${title}" → ${db.id}`);
  }

  if (SEED) {
    console.log(`[setup-new-dbs] lendo seed de ${SITE_JSON}`);
    let raw;
    try {
      raw = await fs.readFile(SITE_JSON, 'utf8');
    } catch (err) {
      console.error(
        `[setup-new-dbs] ERRO lendo ${SITE_JSON}: ${err?.message || err}\n` +
          '  DBs criados vazios. Rode novamente com --no-seed ou popule manualmente.',
      );
      process.exit(1);
    }
    const site = JSON.parse(raw);
    await seedKpis(
      ids['Site KPIs'],
      site.hero?.metrics || [],
      site.cv?.kpis || [],
    );
    await seedCvHighlights(ids['Site CV Highlights'], site.cv?.deliverables || []);
  }

  console.log('\n=== SECRETS (cole no repo rodckdev/portfolio) ===');
  console.log(`NOTION_KPIS_DB_ID=${ids['Site KPIs']}`);
  console.log(`NOTION_CV_HIGHLIGHTS_DB_ID=${ids['Site CV Highlights']}`);
  console.log('==================================================');
}

// KPIs: faz a união hero.metrics ∪ cv.kpis (mesmo label = mesma linha).
// HeroOrder e CvOrder refletem a ordem original em cada lista; se um KPI não
// aparece em uma das duas, o campo fica null (não exibe naquele bloco).
async function seedKpis(dbId, heroMetrics, cvKpis) {
  const byLabel = new Map();
  (heroMetrics || []).forEach((m, i) => {
    const key = String(m.label || '').trim().toLowerCase();
    if (!key) return;
    const existing = byLabel.get(key) || { label: m.label, value: m.value || '' };
    existing.heroOrder = i + 1;
    if (!existing.value) existing.value = m.value || '';
    byLabel.set(key, existing);
  });
  (cvKpis || []).forEach((k, i) => {
    const key = String(k.label || '').trim().toLowerCase();
    if (!key) return;
    const existing = byLabel.get(key) || { label: k.label, value: k.value || '' };
    existing.cvOrder = i + 1;
    if (!existing.value) existing.value = k.value || '';
    byLabel.set(key, existing);
  });
  for (const row of byLabel.values()) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(row.label),
        Value: rt(row.value),
        HeroOrder: num(row.heroOrder),
        CvOrder: num(row.cvOrder),
        Published: { checkbox: true },
      },
    });
    console.log(
      `  · kpi seeded: ${row.label} (hero=${row.heroOrder ?? '-'}, cv=${row.cvOrder ?? '-'})`,
    );
  }
}

async function seedCvHighlights(dbId, items) {
  for (let i = 0; i < (items || []).length; i += 1) {
    const h = items[i];
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(h.title),
        Detail: rt(h.detail),
        Order: num(i + 1),
        Published: { checkbox: true },
      },
    });
    console.log(`  · cv highlight seeded: ${h.title}`);
  }
}

function titleProp(text) {
  return { title: [{ type: 'text', text: { content: String(text || '') } }] };
}
function rt(text) {
  const s = String(text || '');
  if (!s) return { rich_text: [] };
  return { rich_text: [{ type: 'text', text: { content: s } }] };
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? { number: n } : { number: null };
}

main().catch((err) => {
  console.error('[setup-new-dbs] ERRO:', err?.message || err);
  process.exit(1);
});
