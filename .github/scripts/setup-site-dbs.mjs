#!/usr/bin/env node
// setup-site-dbs.mjs — bootstrap one-shot (roda localmente, NÃO no Action).
//
// Cria no workspace do Notion os 5 DBs que alimentam o site:
//   - Site Deliverables
//   - Site Skills
//   - Site Initiatives
//   - Site Influence
//   - Site Progress
//
// Todos como filhos da página apontada por NOTION_PARENT_PAGE_ID, com schema
// exatamente compatível com o que `sync-notion.mjs` espera. Depois de criar,
// opcionalmente importa o conteúdo atual de `assets/data/site.json` como seed
// (assim você não precisa recriar manualmente no Notion).
//
// Uso:
//   export NOTION_API_KEY=secret_...
//   export NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   node .github/scripts/setup-site-dbs.mjs          # cria + seed
//   node .github/scripts/setup-site-dbs.mjs --no-seed   # só cria os DBs
//
// Ao final imprime os 5 IDs — copie para os secrets do repo:
//   NOTION_DELIVERABLES_DB_ID, NOTION_SKILLS_DB_ID, NOTION_INITIATIVES_DB_ID,
//   NOTION_INFLUENCE_DB_ID, NOTION_PROGRESS_DB_ID.

import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const PARENT_ID = process.env.NOTION_PARENT_PAGE_ID;
const SEED = !process.argv.includes('--no-seed');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../');
const SITE_JSON = path.join(ROOT, 'assets/data/site.json');

if (!NOTION_API_KEY || !PARENT_ID) {
  console.error(
    'Uso: NOTION_API_KEY=... NOTION_PARENT_PAGE_ID=... node .github/scripts/setup-site-dbs.mjs [--no-seed]',
  );
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

const GAP_OPTIONS = ['None', 'Pequeno', 'Médio', 'Alto'];
const LEVEL_OPTIONS = [
  'Expert',
  'Sênior',
  'Intermediário',
  'Básico',
  'Teórico',
  'Operacional',
  'Funcional',
  'B1',
  'B2',
  'C1',
  'Influenciador',
  'Estratégico',
];
const STATUS_OPTIONS = [
  { name: 'ok', color: 'green' },
  { name: 'warn', color: 'yellow' },
  { name: 'mid', color: 'orange' },
  { name: 'err', color: 'red' },
];

const SCHEMAS = {
  'Site Deliverables': {
    Name: { title: {} },
    Num: { rich_text: {} },
    Order: { number: {} },
    Subtitle: { rich_text: {} },
    WhatWasDone: { rich_text: {} },
    TechnicalImpact: { rich_text: {} },
    FinancialImpact: { rich_text: {} },
    OperationalImpact: { rich_text: {} },
    Stakeholders: { rich_text: {} },
    Metrics: { rich_text: {} },
    Published: { checkbox: {} },
  },
  'Site Skills': {
    Name: { title: {} },
    Order: { number: {} },
    Current: { select: { options: LEVEL_OPTIONS.map((n) => ({ name: n })) } },
    Target: { rich_text: {} },
    Gap: { select: { options: GAP_OPTIONS.map((n) => ({ name: n })) } },
    Plan: { rich_text: {} },
    Published: { checkbox: {} },
  },
  'Site Initiatives': {
    Name: { title: {} },
    Order: { number: {} },
    Tag: { rich_text: {} },
    What: { rich_text: {} },
    Why: { rich_text: {} },
    Impact: { rich_text: {} },
    Metric: { rich_text: {} },
    Published: { checkbox: {} },
  },
  'Site Influence': {
    Name: { title: {} },
    Order: { number: {} },
    Body: { rich_text: {} },
    Published: { checkbox: {} },
  },
  'Site Progress': {
    Name: { title: {} },
    Order: { number: {} },
    Status: { select: { options: STATUS_OPTIONS } },
    StatusLabel: { rich_text: {} },
    Target: { rich_text: {} },
    Evidence: { rich_text: {} },
    Published: { checkbox: {} },
  },
};

async function main() {
  console.log(`[setup-site-dbs] parent page = ${PARENT_ID}`);
  const ids = {};
  for (const [title, properties] of Object.entries(SCHEMAS)) {
    const db = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_ID },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    });
    ids[title] = db.id;
    console.log(`[setup-site-dbs] criado "${title}" → ${db.id}`);
  }

  if (SEED) {
    const raw = await fs.readFile(SITE_JSON, 'utf8').catch(() => null);
    if (!raw) {
      console.warn('[setup-site-dbs] site.json não encontrado — pulando seed');
    } else {
      const site = JSON.parse(raw);
      await seedDeliverables(ids['Site Deliverables'], site.deliverables?.items || []);
      await seedSkills(ids['Site Skills'], site.skills?.rows || []);
      await seedInitiatives(ids['Site Initiatives'], site.initiatives?.items || []);
      await seedInfluence(ids['Site Influence'], site.influence?.items || []);
      await seedProgress(ids['Site Progress'], site.progress?.rows || []);
    }
  }

  console.log('\n=== SECRETS (cole no repo rodckdev/portfolio) ===');
  console.log(`NOTION_DELIVERABLES_DB_ID=${ids['Site Deliverables']}`);
  console.log(`NOTION_SKILLS_DB_ID=${ids['Site Skills']}`);
  console.log(`NOTION_INITIATIVES_DB_ID=${ids['Site Initiatives']}`);
  console.log(`NOTION_INFLUENCE_DB_ID=${ids['Site Influence']}`);
  console.log(`NOTION_PROGRESS_DB_ID=${ids['Site Progress']}`);
  console.log('===============================================');
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
async function seedDeliverables(dbId, items) {
  for (const d of items) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(d.title),
        Num: rt(d.num),
        Order: num(d.order),
        Subtitle: rt(stripHtml(d.sub || d.subHtml || '')),
        WhatWasDone: rt(bulletsAsText(findBlock(d.blocks, /o que foi feito/i))),
        TechnicalImpact: rt(bulletsAsText(findBlock(d.blocks, /impacto t[eé]cnico/i))),
        FinancialImpact: rt(
          bulletsAsText(findBlock(d.blocks, /impacto financeiro|por que importa/i)),
        ),
        OperationalImpact: rt(
          bulletsAsText(findBlock(d.blocks, /impacto operacional|como foi medido/i)),
        ),
        Stakeholders: rt(bulletsAsText(findBlock(d.blocks, /stakeholders/i))),
        Metrics: rt((d.metrics || []).join('\n')),
        Published: { checkbox: true },
      },
    });
    console.log(`  · deliverable seeded: ${d.title}`);
  }
}

async function seedSkills(dbId, rows) {
  for (const r of rows) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(r.skill),
        Order: num(r.order),
        Current: r.current ? { select: { name: r.current } } : { select: null },
        Target: rt(r.target),
        Gap: r.gap ? { select: { name: r.gap } } : { select: null },
        Plan: rt(r.plan),
        Published: { checkbox: true },
      },
    });
    console.log(`  · skill seeded: ${r.skill}`);
  }
}

async function seedInitiatives(dbId, items) {
  for (const it of items) {
    const get = (label) =>
      (it.fields || []).find((f) =>
        String(f.label || '').toLowerCase().startsWith(label),
      )?.value || '';
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(it.title),
        Order: num(it.order),
        Tag: rt(it.tag),
        What: rt(get('o que')),
        Why: rt(get('por que')),
        Impact: rt(get('impacto')),
        Metric: rt(get('métrica') || get('metrica')),
        Published: { checkbox: true },
      },
    });
    console.log(`  · initiative seeded: ${it.title}`);
  }
}

async function seedInfluence(dbId, items) {
  for (const it of items) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(it.tag),
        Order: num(it.order),
        Body: rt(stripHtml(it.bodyHtml || it.body || '')),
        Published: { checkbox: true },
      },
    });
    console.log(`  · influence seeded: ${it.tag}`);
  }
}

async function seedProgress(dbId, rows) {
  for (const r of rows) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(r.dimension),
        Order: num(r.order),
        Status: r.status ? { select: { name: r.status } } : { select: null },
        StatusLabel: rt(r.statusLabel),
        Target: rt(r.target),
        Evidence: rt(stripHtml(r.evidenceHtml || r.evidence || '')),
        Published: { checkbox: true },
      },
    });
    console.log(`  · progress seeded: ${r.dimension}`);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
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
function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}
function findBlock(blocks, regex) {
  return (blocks || []).find((b) => regex.test(b.heading || ''));
}
function bulletsAsText(block) {
  if (!block) return '';
  const arr = block.bulletsHtml || block.bullets || [];
  return arr.map((b) => stripHtml(b)).join('\n');
}

main().catch((err) => {
  console.error('[setup-site-dbs] ERRO:', err?.message || err);
  process.exit(1);
});
