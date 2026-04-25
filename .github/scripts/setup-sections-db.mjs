#!/usr/bin/env node
// setup-sections-db.mjs — cria SOMENTE o DB "Site Sections" no Notion.
//
// O DB guarda cabeçalhos editáveis (kicker/title/sub) e um publish toggle
// por seção do site. Uma linha por seção, com Name sendo a chave (overview,
// deliverables, influence, matrix, skills, progress, initiatives, committee,
// cv).
//
// Use este script quando você JÁ rodou setup-site-dbs.mjs e setup-new-dbs.mjs
// (7 DBs existem) e só quer adicionar o 8º sem duplicar nada. Seed do
// site.json atual é feito automaticamente (passe --no-seed para pular).
//
// Uso:
//   export NOTION_API_KEY=ntn_...
//   export NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   node .github/scripts/setup-sections-db.mjs          # cria + seed
//   node .github/scripts/setup-sections-db.mjs --no-seed

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
    'Uso: NOTION_API_KEY=... NOTION_PARENT_PAGE_ID=... node .github/scripts/setup-sections-db.mjs [--no-seed]',
  );
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

const SCHEMA = {
  Name: { title: {} },
  Kicker: { rich_text: {} },
  Title: { rich_text: {} },
  Sub: { rich_text: {} },
  Published: { checkbox: {} },
};

async function main() {
  console.log(`[setup-sections-db] parent page = ${PARENT_ID}`);
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: PARENT_ID },
    title: [{ type: 'text', text: { content: 'Site Sections' } }],
    properties: SCHEMA,
  });
  console.log(`[setup-sections-db] criado "Site Sections" → ${db.id}`);

  if (SEED) {
    console.log(`[setup-sections-db] lendo seed de ${SITE_JSON}`);
    let raw;
    try {
      raw = await fs.readFile(SITE_JSON, 'utf8');
    } catch (err) {
      console.error(
        `[setup-sections-db] ERRO lendo ${SITE_JSON}: ${err?.message || err}\n` +
          '  DB criado vazio. Rode novamente com --no-seed ou popule manualmente.',
      );
      process.exit(1);
    }
    const site = JSON.parse(raw);
    await seedSections(db.id, site.sections || {});
  }

  console.log('\n=== SECRET (cole no repo rodckdev/portfolio) ===');
  console.log(`NOTION_SECTIONS_DB_ID=${db.id}`);
  console.log('=================================================');
}

async function seedSections(dbId, sections) {
  const entries = Object.entries(sections || {});
  if (entries.length === 0) {
    console.log('[setup-sections-db] site.json não tem "sections" — pulando seed.');
    return;
  }
  for (const [key, meta] of entries) {
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: titleProp(key),
        Kicker: rt(meta.kicker),
        Title: rt(meta.title),
        Sub: rt(meta.sub),
        Published: { checkbox: meta.published !== false },
      },
    });
    console.log(`  · section seeded: ${key}`);
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

main().catch((err) => {
  console.error('[setup-sections-db] ERRO:', err?.message || err);
  process.exit(1);
});
