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
//   NOTION_KPIS_DB_ID          — site.json → hero.metrics + cv.kpis
//   NOTION_CV_HIGHLIGHTS_DB_ID — site.json → cv.deliverables
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
  kpis: process.env.NOTION_KPIS_DB_ID,
  cvHighlights: process.env.NOTION_CV_HIGHLIGHTS_DB_ID,
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

  // Path-based updates (hero.metrics, cv.kpis, cv.deliverables) — DBs
  // compactos que alimentam listas aninhadas em vez de seções inteiras.
  const pathUpdates = {};
  if (DB_IDS.kpis) {
    const { hero, cv } = await syncKpis(DB_IDS.kpis);
    pathUpdates['hero.metrics'] = hero;
    pathUpdates['cv.kpis'] = cv;
  }
  if (DB_IDS.cvHighlights) {
    pathUpdates['cv.deliverables'] = await syncCvHighlights(DB_IDS.cvHighlights);
  }

  const anyUpdate =
    Object.keys(siteUpdates).length > 0 || Object.keys(pathUpdates).length > 0;
  if (anyUpdate) {
    const sections = await mergeSite(siteUpdates, pathUpdates);
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
async function mergeSite(updates, pathUpdates = {}) {
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

  // pathUpdates: { 'hero.metrics': [...], 'cv.kpis': [...], 'cv.deliverables': [...] }
  // DB vazio = mantém o que está comitado (skipped-empty). Sem ID por item,
  // é sobrescrita total — ordem e presença vêm 100% do Notion.
  for (const [dotted, fetched] of Object.entries(pathUpdates)) {
    if (!Array.isArray(fetched)) {
      status[dotted] = { count: 0, status: 'invalid' };
      continue;
    }
    if (fetched.length === 0) {
      status[dotted] = { count: 0, status: 'skipped-empty' };
      continue;
    }
    setPath(current, dotted, fetched);
    status[dotted] = { count: fetched.length, status: 'updated' };
  }

  current.syncedAt = new Date().toISOString();
  await writeJson(SITE_PATH, current);
  return status;
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

async function readJsonSafe(p) {
  // Só é "safe" para ENOENT (primeiro run, arquivo ainda não existe).
  // Qualquer outro erro (JSON inválido por conflito de merge, permissão, etc.)
  // precisa falhar loud — senão o sync-notion silenciosamente apaga as
  // seções estáticas (meta/hero/overview/committee/cv) que não vêm do Notion.
  let raw;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[sync-notion] ${p} inválido (${err.message}). Corrija o JSON antes de sincronizar — abortando para não apagar conteúdo.`,
    );
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
  logFetched('deliverables', pages, (p) => getTitle(p.properties.Name));
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
      extras: extractExtras(p, KNOWN.deliverables),
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
  logFetched('skills', pages, (p) => getTitle(p.properties.Name));
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
      extras: extractExtras(p, KNOWN.skills),
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
  logFetched('initiatives', pages, (p) => getTitle(p.properties.Name));
  return pages.map((page) => {
    const p = page.properties;
    const fields = [];
    pushField(fields, 'O que', getRichText(p.What));
    pushField(fields, 'Por que', getRichText(p.Why));
    pushField(fields, 'Impacto', getRichText(p.Impact));
    pushField(fields, 'Métrica', getRichText(p.Metric));
    return {
      id: slug(getTitle(p.Name)) || page.id,
      order: getNumber(p.Order) || 0,
      tag: getRichText(p.Tag) || '',
      title: getTitle(p.Name) || '',
      fields,
      extras: extractExtras(p, KNOWN.initiatives),
    };
  });
}

function pushField(fields, label, value) {
  if (value) fields.push({ label, value });
}

// Loga cada página retornada (titulo + id curto) — útil p/ debugar de fora
// sem expor secrets. Aparece em Actions → Sync Notion content → Run logs.
function logFetched(section, pages, titleOf) {
  if (!Array.isArray(pages) || pages.length === 0) {
    console.log(`[sync-notion]   ${section}: 0 páginas (Published=true vazio?)`);
    return;
  }
  pages.forEach((p, i) => {
    const title = titleOf ? titleOf(p) : p.id;
    console.log(`[sync-notion]   ${section}[${i}] ${title} · ${p.id}`);
  });
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
  logFetched('influence', pages, (p) => getTitle(p.properties.Name));
  return pages.map((page) => {
    const p = page.properties;
    return {
      id: slug(getTitle(p.Name)) || page.id,
      order: getNumber(p.Order) || 0,
      tag: getTitle(p.Name) || '',
      body: getRichText(p.Body) || '',
      extras: extractExtras(p, KNOWN.influence),
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
  logFetched('progress', pages, (p) => getTitle(p.properties.Name));
  return pages.map((page) => {
    const p = page.properties;
    return {
      order: getNumber(p.Order) || 0,
      dimension: getTitle(p.Name) || '',
      status: getSelect(p.Status) || 'warn',
      statusLabel: getRichText(p.StatusLabel) || '',
      target: getRichText(p.Target) || '',
      evidence: getRichText(p.Evidence) || '',
      extras: extractExtras(p, KNOWN.progress),
    };
  });
}

// ---------------------------------------------------------------------------
// KPIs — alimenta tanto hero.metrics quanto cv.kpis a partir de um único DB.
// Schema:
//   Name (title)               → label (ex: "Economia anual")
//   Value (rich_text)          → valor exibido (ex: "USD 11M+")
//   HeroOrder (number)         → posição no hero; vazio = não aparece no hero
//   CvOrder (number)           → posição no CV; vazio = não aparece no CV
//   Published (checkbox)       → filtro
// ---------------------------------------------------------------------------
async function syncKpis(dbId) {
  console.log('[sync-notion] kpis ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    page_size: 50,
  });
  logFetched('kpis', pages, (p) => getTitle(p.properties.Name));
  const heroItems = [];
  const cvItems = [];
  pages.forEach((page) => {
    const p = page.properties;
    const label = getTitle(p.Name) || '';
    const value = getRichText(p.Value) || '';
    if (!label && !value) return;
    const heroOrder = getNumber(p.HeroOrder);
    const cvOrder = getNumber(p.CvOrder);
    if (heroOrder != null) heroItems.push({ _order: heroOrder, label, value });
    if (cvOrder != null) cvItems.push({ _order: cvOrder, value, label });
  });
  heroItems.sort((a, b) => a._order - b._order);
  cvItems.sort((a, b) => a._order - b._order);
  return {
    hero: heroItems.map(({ _order, ...rest }) => rest),
    cv: cvItems.map(({ _order, ...rest }) => rest),
  };
}

// ---------------------------------------------------------------------------
// CV Highlights — alimenta a lista de destaques do one-pager (cv.deliverables)
// Schema:
//   Name (title)               → título do destaque (ex: "HA multi-site Splunk")
//   Detail (rich_text)         → descrição curta (1-2 linhas)
//   Order (number)             → ordenação
//   Published (checkbox)       → filtro
// ---------------------------------------------------------------------------
async function syncCvHighlights(dbId) {
  console.log('[sync-notion] cv highlights ← DB', dbId);
  const pages = await queryAll({
    database_id: dbId,
    filter: publishedFilter(),
    sorts: [{ property: 'Order', direction: 'ascending' }],
    page_size: 50,
  });
  logFetched('cv-highlights', pages, (p) => getTitle(p.properties.Name));
  return pages.map((page) => {
    const p = page.properties;
    return {
      title: getTitle(p.Name) || '',
      detail: getRichText(p.Detail) || '',
    };
  });
}

// ---------------------------------------------------------------------------
// Extras — colunas novas no Notion refletindo no site sem mexer no código
// ---------------------------------------------------------------------------
// Qualquer propriedade que NÃO esteja em `knownKeys` vira um item em `extras`:
//   { key, label, kind, value }
// Tipos suportados: rich_text, select, multi_select, number, url, email,
// phone_number, checkbox, date. Vazios são descartados para não poluir.
// A renderização no site adapta-se por `kind`:
//   text/select        → linha de definição (dt/dd)
//   multi_select       → chips
//   url                → link clicável
//   checkbox           → ✅ / ❌
//   number             → número formatado
//   date               → ISO (start) — o site formata
function extractExtras(properties, knownKeys) {
  if (!properties || typeof properties !== 'object') return [];
  const known = new Set(knownKeys);
  const extras = [];
  for (const [label, prop] of Object.entries(properties)) {
    if (known.has(label)) continue;
    if (!prop || typeof prop !== 'object') continue;
    const parsed = coerceProp(prop);
    if (parsed == null) continue;
    if (parsed.kind === 'text' && !parsed.value) continue;
    if (parsed.kind === 'multi_select' && parsed.value.length === 0) continue;
    extras.push({
      key: slug(label),
      label,
      kind: parsed.kind,
      value: parsed.value,
    });
  }
  return extras;
}

function coerceProp(prop) {
  switch (prop.type) {
    case 'rich_text':
      return { kind: 'text', value: getRichText(prop) };
    case 'select':
      return { kind: 'select', value: getSelect(prop) };
    case 'multi_select': {
      const value = (prop.multi_select || [])
        .map((t) => t && t.name)
        .filter(Boolean);
      return { kind: 'multi_select', value };
    }
    case 'number':
      return { kind: 'number', value: prop.number ?? null };
    case 'url':
      return { kind: 'url', value: prop.url || '' };
    case 'email':
      return { kind: 'url', value: prop.email ? `mailto:${prop.email}` : '' };
    case 'phone_number':
      return { kind: 'text', value: prop.phone_number || '' };
    case 'checkbox':
      return { kind: 'checkbox', value: !!prop.checkbox };
    case 'date': {
      const d = prop.date || {};
      const value = d.end ? `${d.start} → ${d.end}` : d.start || '';
      return { kind: 'date', value };
    }
    default:
      // title, files, people, relation, rollup, formula, created_*, last_*
      // ficam de fora: são derivados ou precisam de resolução extra.
      return null;
  }
}

// Propriedades que já são consumidas pelas funções sync* de cada seção.
// Nada nessa lista vira "extras".
const KNOWN = {
  deliverables: [
    'Name', 'Num', 'Order', 'Subtitle',
    'WhatWasDone', 'TechnicalImpact', 'FinancialImpact', 'OperationalImpact',
    'Stakeholders', 'Metrics', 'Published',
  ],
  skills: ['Name', 'Order', 'Current', 'Target', 'Gap', 'Plan', 'Published'],
  initiatives: ['Name', 'Order', 'Tag', 'What', 'Why', 'Impact', 'Metric', 'Published'],
  influence: ['Name', 'Order', 'Body', 'Published'],
  progress: [
    'Name', 'Order', 'Status', 'StatusLabel', 'Target', 'Evidence', 'Published',
  ],
  kpis: ['Name', 'Value', 'HeroOrder', 'CvOrder', 'Published'],
  cvHighlights: ['Name', 'Detail', 'Order', 'Published'],
};

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
