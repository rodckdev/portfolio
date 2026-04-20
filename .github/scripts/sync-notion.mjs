#!/usr/bin/env node
// sync-notion.mjs — puxa o conteúdo do portfólio do Notion e gera os dois
// JSONs consumidos pelo site:
//
//   assets/data/posts.json  ← DB "Portfólio" (posts públicos, Publicable=true)
//   assets/data/site.json   ← 5 DBs de CMS (deliverables, skills, initiatives,
//                              influence, progress) — merge-update: seção só
//                              é sobrescrita se o DB retornar items. Caso
//                              contrário mantém o que está comitado.
//
// Envs reconhecidas (todas opcionais exceto NOTION_API_KEY):
//   NOTION_API_KEY             — obrigatório para rodar de verdade
//   NOTION_PORTFOLIO_DB_ID     — posts.json
//   NOTION_DELIVERABLES_DB_ID  — site.json → deliverables
//   NOTION_SKILLS_DB_ID        — site.json → skills
//   NOTION_INITIATIVES_DB_ID   — site.json → initiatives
//   NOTION_INFLUENCE_DB_ID     — site.json → influence
//   NOTION_PROGRESS_DB_ID      — site.json → progress
//
// Sem NOTION_API_KEY o script sai com exit 0 (não quebra CI enquanto os
// secrets não estão setados). Cada DB é opcional — ausência simplesmente
// não atualiza aquela seção.

import { Client } from '@notionhq/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.env.GITHUB_WORKSPACE || path.resolve('.'));
const POSTS_PATH = path.join(ROOT, 'assets/data/posts.json');
const SITE_PATH = path.join(ROOT, 'assets/data/site.json');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const DB_IDS = {
  portfolio: process.env.NOTION_PORTFOLIO_DB_ID,
  deliverables: process.env.NOTION_DELIVERABLES_DB_ID,
  skills: process.env.NOTION_SKILLS_DB_ID,
  initiatives: process.env.NOTION_INITIATIVES_DB_ID,
  influence: process.env.NOTION_INFLUENCE_DB_ID,
  progress: process.env.NOTION_PROGRESS_DB_ID,
};

if (!NOTION_API_KEY) {
  console.log('[sync-notion] NOTION_API_KEY ausente — nada a fazer.');
  process.exit(0);
}

const notion = new Client({ auth: NOTION_API_KEY });

async function main() {
  const summary = [];

  if (DB_IDS.portfolio) {
    const posts = await syncPosts(DB_IDS.portfolio);
    summary.push(`posts: ${posts}`);
  } else {
    console.log('[sync-notion] NOTION_PORTFOLIO_DB_ID ausente — pulando posts.json');
  }

  const siteUpdates = {};
  if (DB_IDS.deliverables)
    siteUpdates.deliverables = await syncDeliverables(DB_IDS.deliverables);
  if (DB_IDS.skills) siteUpdates.skills = await syncSkills(DB_IDS.skills);
  if (DB_IDS.initiatives)
    siteUpdates.initiatives = await syncInitiatives(DB_IDS.initiatives);
  if (DB_IDS.influence) siteUpdates.influence = await syncInfluence(DB_IDS.influence);
  if (DB_IDS.progress) siteUpdates.progress = await syncProgress(DB_IDS.progress);

  if (Object.keys(siteUpdates).length > 0) {
    const sections = await mergeSite(siteUpdates);
    summary.push(
      ...Object.entries(sections).map(([k, v]) => `${k}: ${v.count} (${v.status})`),
    );
  } else {
    console.log('[sync-notion] nenhum DB de conteúdo configurado — site.json intocado');
  }

  console.log('[sync-notion] done.', summary.join(' · ') || 'nada sincronizado');
}

// ---------------------------------------------------------------------------
// posts.json (DB Portfólio)
// ---------------------------------------------------------------------------
async function syncPosts(dbId) {
  console.log('[sync-notion] posts ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: { property: 'Publicable', checkbox: { equals: true } },
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 50,
  });
  const items = pages.map(toPost).filter(Boolean);
  const payload = {
    updated: new Date().toISOString(),
    count: items.length,
    items,
  };
  await writeJson(POSTS_PATH, payload);
  console.log(`[sync-notion] posts.json: ${items.length} items`);
  return items.length;
}

function toPost(page) {
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

// ---------------------------------------------------------------------------
// site.json — merge-update
// ---------------------------------------------------------------------------
async function mergeSite(updates) {
  const current = await readJsonSafe(SITE_PATH);
  const status = {};

  for (const [section, fetched] of Object.entries(updates)) {
    if (!Array.isArray(fetched)) {
      status[section] = { count: 0, status: 'invalid' };
      continue;
    }
    if (fetched.length === 0) {
      status[section] = { count: 0, status: 'skipped-empty' };
      continue;
    }
    if (!current[section] || typeof current[section] !== 'object') {
      current[section] = {};
    }
    const key = section === 'progress' ? 'rows' : section === 'skills' ? 'rows' : 'items';
    // Shallow-merge por id: campos do Notion sobrescrevem; campos locais que
    // o Notion não conhece (ex: `table` em deliverables, desenhado no JSON)
    // são preservados para não apagar a cada sync.
    const prior = Array.isArray(current[section][key]) ? current[section][key] : [];
    const priorById = new Map(
      prior.filter((it) => it && typeof it === 'object' && it.id).map((it) => [it.id, it]),
    );
    current[section][key] = fetched.map((it) => {
      const before = priorById.get(it?.id);
      return before ? { ...before, ...it } : it;
    });
    status[section] = { count: fetched.length, status: 'updated' };
  }

  current.syncedAt = new Date().toISOString();
  await writeJson(SITE_PATH, current);
  return status;
}

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Deliverables
// Schema esperado no Notion:
//   Name (title)                     → title
//   Num (rich_text)                  → "E1".."E5"
//   Order (number)                   → ordenação
//   Subtitle (rich_text)
//   WhatWasDone (rich_text)          → bullets (1 por linha)
//   TechnicalImpact (rich_text)      → bullets
//   FinancialImpact (rich_text)      → bullets
//   OperationalImpact (rich_text)    → bullets (opcional; só E3)
//   Stakeholders (rich_text)         → bullets
//   Metrics (rich_text)              → bullets (1 por linha, p/ metrics-row)
//   Published (checkbox)             → filtro
// ---------------------------------------------------------------------------
async function syncDeliverables(dbId) {
  console.log('[sync-notion] deliverables ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  return pages.map((page) => {
    const p = page.properties;
    const blocks = [];
    addBlock(blocks, 'O que foi feito', getMultiline(p.WhatWasDone));
    addBlock(blocks, 'Impacto técnico', getMultiline(p.TechnicalImpact));
    addBlock(blocks, 'Impacto financeiro', getMultiline(p.FinancialImpact));
    addBlock(blocks, 'Impacto operacional', getMultiline(p.OperationalImpact));
    addBlock(blocks, 'Stakeholders beneficiados', getMultiline(p.Stakeholders));
    return {
      id: slug(getTitle(p.Name)) || page.id,
      num: getRichText(p.Num) || '',
      order: getNumber(p.Order) || 0,
      title: getTitle(p.Name) || '',
      sub: getRichText(p.Subtitle) || '',
      blocks,
      metrics: getMultiline(p.Metrics),
    };
  });
}

function addBlock(blocks, heading, bullets) {
  if (!bullets || bullets.length === 0) return;
  blocks.push({ heading, bullets });
}

// ---------------------------------------------------------------------------
// Skills
// Schema:
//   Name (title)               → skill
//   Order (number)
//   Current (select: Expert|Sênior|Intermediário|Básico|Teórico|...)
//   Target (rich_text)
//   Gap (select: None|Pequeno|Médio|Alto)
//   Plan (rich_text)
//   Published (checkbox)
// ---------------------------------------------------------------------------
async function syncSkills(dbId) {
  console.log('[sync-notion] skills ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  return pages.map((page) => {
    const p = page.properties;
    const current = getSelect(p.Current);
    const gap = getSelect(p.Gap);
    return {
      order: getNumber(p.Order) || 0,
      skill: getTitle(p.Name) || '',
      current,
      currentBadge: badgeForLevel(current),
      target: getRichText(p.Target) || '',
      gap,
      gapBadge: badgeForGap(gap),
      plan: getRichText(p.Plan) || '',
    };
  });
}

function badgeForLevel(v) {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('expert') || s.startsWith('sênior') || s.startsWith('senior'))
    return 'ok';
  if (s.startsWith('básico') || s.startsWith('basico') || s.startsWith('b1')) return 'mid';
  if (s.startsWith('teórico') || s.startsWith('teorico') || s.includes('operacional'))
    return 'warn';
  return 'warn';
}
function badgeForGap(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'none' || s === 'nenhum') return 'ok';
  if (s === 'pequeno' || s === 'baixo') return 'warn';
  if (s === 'médio' || s === 'medio') return 'warn';
  if (s === 'alto' || s === 'high') return 'err';
  return 'warn';
}

// ---------------------------------------------------------------------------
// Initiatives
// Schema:
//   Name (title)               → title
//   Order (number)
//   Tag (rich_text)            → "Iniciativa 1 · Maio – Junho"
//   What (rich_text)
//   Why (rich_text)
//   Impact (rich_text)
//   Metric (rich_text)
//   Published (checkbox)
// ---------------------------------------------------------------------------
async function syncInitiatives(dbId) {
  console.log('[sync-notion] initiatives ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  return pages.map((page) => {
    const p = page.properties;
    const fields = [];
    pushField(fields, 'O que', getRichText(p.What));
    pushField(fields, 'Por que', getRichText(p.Why));
    pushField(fields, 'Impacto', getRichText(p.Impact));
    pushField(fields, 'Métrica', getRichText(p.Metric));
    return {
      order: getNumber(p.Order) || 0,
      tag: getRichText(p.Tag) || '',
      title: getTitle(p.Name) || '',
      fields,
    };
  });
}

function pushField(fields, label, value) {
  if (value) fields.push({ label, value });
}

// ---------------------------------------------------------------------------
// Influence
// Schema:
//   Name (title)               → tag (ex: "Team A")
//   Order (number)
//   Body (rich_text)           → descrição
//   Published (checkbox)
// ---------------------------------------------------------------------------
async function syncInfluence(dbId) {
  console.log('[sync-notion] influence ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  return pages.map((page) => {
    const p = page.properties;
    return {
      order: getNumber(p.Order) || 0,
      tag: getTitle(p.Name) || '',
      body: getRichText(p.Body) || '',
    };
  });
}

// ---------------------------------------------------------------------------
// Progress
// Schema:
//   Name (title)               → dimension
//   Order (number)
//   Status (select: ok|warn|mid|err)
//   StatusLabel (rich_text)    → ex: "✅ estável"
//   Target (rich_text)
//   Evidence (rich_text)
//   Published (checkbox)
// ---------------------------------------------------------------------------
async function syncProgress(dbId) {
  console.log('[sync-notion] progress ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  return pages.map((page) => {
    const p = page.properties;
    return {
      order: getNumber(p.Order) || 0,
      dimension: getTitle(p.Name) || '',
      status: getSelect(p.Status) || 'warn',
      statusLabel: getRichText(p.StatusLabel) || '',
      target: getRichText(p.Target) || '',
      evidence: getRichText(p.Evidence) || '',
    };
  });
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------
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

function publishedFilter() {
  return { property: 'Published', checkbox: { equals: true } };
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
function getNumber(prop) {
  if (!prop || prop.type !== 'number') return null;
  return prop.number ?? null;
}
function getMultiline(prop) {
  const raw = getRichText(prop);
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`[sync-notion] escrito ${path.relative(ROOT, file)}`);
}

main().catch((err) => {
  console.error('[sync-notion] ERRO:', err?.message || err);
  process.exit(1);
});
