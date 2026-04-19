#!/usr/bin/env node
// sync-notion.mjs — lê o DB "Portfólio" do Notion (entradas com Publicable=true),
// mapeia para um shape estável (título, categoria, contexto, problema, solução,
// resultado, tecnologias, data da última edição, url) e escreve
// assets/data/posts.json na raiz do repo.
//
// Roda no GitHub Actions (.github/workflows/sync-notion.yml). Precisa de:
//   env NOTION_API_KEY          — token da integration do Notion
//   env NOTION_PORTFOLIO_DB_ID  — id do database "Portfólio"

import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_PORTFOLIO_DB_ID = process.env.NOTION_PORTFOLIO_DB_ID;
const OUT_PATH = path.resolve(
  process.env.GITHUB_WORKSPACE || path.resolve('.'),
  'assets/data/posts.json',
);

if (!NOTION_API_KEY || !NOTION_PORTFOLIO_DB_ID) {
  console.error(
    '[sync-notion] NOTION_API_KEY e NOTION_PORTFOLIO_DB_ID precisam estar setados.',
  );
  // Exit 0 para não marcar o Action como falho enquanto os secrets não existem —
  // assim o workflow roda o happy-path no primeiro setup, sem quebrar CI.
  process.exit(0);
}

const notion = new Client({ auth: NOTION_API_KEY });

async function main() {
  console.log('[sync-notion] querying DB', NOTION_PORTFOLIO_DB_ID);
  const pages = await queryAll({
    database_id: NOTION_PORTFOLIO_DB_ID,
    filter: {
      property: 'Publicable',
      checkbox: { equals: true },
    },
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 50,
  });
  console.log(`[sync-notion] ${pages.length} páginas publicáveis encontradas`);

  const items = pages.map(toItem).filter(Boolean);
  const payload = {
    updated: new Date().toISOString(),
    count: items.length,
    items,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[sync-notion] escrito em ${OUT_PATH}`);
}

async function queryAll(baseArgs) {
  const results = [];
  let cursor = undefined;
  for (let page = 0; page < 20; page += 1) {
    const res = await notion.databases.query({
      ...baseArgs,
      start_cursor: cursor,
    });
    results.push(...res.results);
    if (!res.has_more) return results;
    cursor = res.next_cursor || undefined;
  }
  console.warn('[sync-notion] paginated 20 vezes sem encerrar — cortando aqui.');
  return results;
}

function toItem(page) {
  if (!page || !page.properties) return null;
  const p = page.properties;
  return {
    id: page.id,
    title: getTitle(p.Name) || 'Sem título',
    category: getSelect(p.Category),
    context: getRichText(p.Context),
    problem: getRichText(p.Problem),
    solution: getRichText(p.Solution),
    result: getRichText(p.Result),
    technologies: getRichText(p.Technologies),
    sourceActivityId: getRichText(p.SourceActivityId),
    lastEdited: page.last_edited_time,
    url: page.url,
  };
}

function getTitle(prop) {
  if (!prop || prop.type !== 'title') return '';
  return (prop.title || []).map((t) => t.plain_text).join('').trim();
}

function getRichText(prop) {
  if (!prop || prop.type !== 'rich_text') return '';
  return (prop.rich_text || []).map((t) => t.plain_text).join('').trim();
}

function getSelect(prop) {
  if (!prop || prop.type !== 'select' || !prop.select) return '';
  return prop.select.name || '';
}

main().catch((err) => {
  console.error('[sync-notion] ERRO:', err?.message || err);
  process.exit(1);
});
