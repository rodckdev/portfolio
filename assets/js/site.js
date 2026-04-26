// site.js — renderer that turns assets/data/site.json into the page.
//
// The HTML keeps a static fallback version of each section. On load, this
// script replaces the inner content of every section it knows about with
// markup derived from the JSON. If the fetch fails, the page stays with the
// fallback HTML (progressive enhancement).
//
// Fields ending in "Html" are inserted via innerHTML on a freshly created
// element and are trusted (they come from our own JSON, never user input).
// Fields without the suffix go through textContent and are always escaped.

(function () {
  'use strict';

  const SITE_SRC = 'assets/data/site.json';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    let data;
    try {
      const res = await fetch(SITE_SRC, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`site.json respondeu ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.warn('[site.js] mantendo fallback HTML:', err?.message || err);
      return;
    }

    SECTIONS = (data && typeof data.sections === 'object' && data.sections) || {};

    if (data.meta) applyMeta(data.meta);
    if (data.hero) renderIfPublished('top', () => renderHero(data.hero));
    if (data.overview)
      renderIfPublished('overview', () => renderOverview(data.overview));
    if (data.deliverables)
      renderIfPublished('deliverables', () => renderDeliverables(data.deliverables));
    if (data.influence)
      renderIfPublished('influence', () => renderInfluence(data.influence));
    if (data.skills || data.progress)
      renderIfPublished('matrix', () => renderMatrix(data.skills, data.progress));
    if (data.initiatives)
      renderIfPublished('next', () => renderInitiatives(data.initiatives));
    if (data.committee)
      renderIfPublished('committee', () => renderCommittee(data.committee));
    if (data.cv) renderIfPublished('cv', () => renderCV(data.cv));

    // Aplica publish toggle também em seções sem renderer próprio
    // (ex.: #projects e #posts são populadas por feeds.js / posts.js).
    hideUnpublishedSections();
  }

  function hideUnpublishedSections() {
    Object.keys(SECTION_KEY_BY_DOM_ID).forEach((domId) => {
      const meta = sectionMeta(domId);
      if (meta && meta.published === false) {
        const s = document.getElementById(domId);
        if (s) s.hidden = true;
      }
    });
  }

  // Mapa section-id (DOM) → chave do DB Site Sections (Notion).
  // Edite aqui se renomear uma seção ou adicionar uma nova gerenciada por
  // cabeçalho dinâmico.
  const SECTION_KEY_BY_DOM_ID = {
    top: 'hero',
    overview: 'overview',
    deliverables: 'deliverables',
    influence: 'influence',
    matrix: 'matrix',
    next: 'initiatives',
    projects: 'projects',
    posts: 'posts',
    committee: 'committee',
    cv: 'cv',
  };

  // Preenchido em init(). Guarda data.sections para o headerOf().
  let SECTIONS = {};

  // Busca metadados (kicker/title/sub/published) de uma seção no objeto
  // `sections` do site.json. Aceita tanto o id do DOM quanto a chave direta.
  function sectionMeta(domIdOrKey) {
    const key = SECTION_KEY_BY_DOM_ID[domIdOrKey] || domIdOrKey;
    return (SECTIONS && SECTIONS[key]) || null;
  }

  // Aplica o publish toggle por seção. Se `published === false` no DB Site
  // Sections, a <section> correspondente é ocultada e o renderer não roda.
  function renderIfPublished(domId, renderer) {
    const section = document.getElementById(domId);
    const meta = sectionMeta(domId);
    if (meta && meta.published === false) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    renderer();
  }

  // Mescla cabeçalho vindo do DB Site Sections (se houver) com o fallback
  // estático do site.json (kicker/title/sub por seção). Qualquer campo
  // preenchido no Notion sobrescreve o estático; vazios caem para o fallback
  // para não apagar headers já bons por acidente.
  function mergeHead(domId, fallback) {
    const meta = sectionMeta(domId) || {};
    return {
      kicker: meta.kicker || (fallback && fallback.kicker) || '',
      title: meta.title || (fallback && fallback.title) || '',
      sub: meta.sub || (fallback && fallback.sub) || '',
      subHtml: (fallback && fallback.subHtml) || '',
    };
  }

  // ---------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------
  function applyMeta(meta) {
    if (meta.title) document.title = meta.title;
    setMeta('description', meta.description);
    setOg('og:title', meta.title);
    setOg('og:description', meta.description);
    setOg('og:url', meta.siteUrl);
  }

  function setMeta(name, value) {
    if (!value) return;
    const el = document.querySelector(`meta[name="${name}"]`);
    if (el) el.setAttribute('content', value);
  }

  function setOg(prop, value) {
    if (!value) return;
    const el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', value);
  }

  // ---------------------------------------------------------------------
  // Hero
  // ---------------------------------------------------------------------
  function renderHero(hero) {
    const section = document.getElementById('top');
    if (!section) return;
    const grid = section.querySelector('.hero-grid');
    if (!grid) return;

    grid.replaceChildren(buildHeroCopy(hero), buildHeroCard(hero));
  }

  function buildHeroCopy(hero) {
    const wrap = el('div', 'hero-copy');
    if (hero.eyebrow) wrap.appendChild(el('span', 'eyebrow', hero.eyebrow));

    const h1 = el('h1');
    const parts = Array.isArray(hero.headlineParts) ? hero.headlineParts : [];
    if (parts.length > 0) {
      parts.forEach((p) => {
        if (p.accent) {
          const span = el('span', 'accent', p.text);
          h1.appendChild(span);
        } else {
          h1.appendChild(document.createTextNode(p.text || ''));
        }
      });
    } else if (hero.headline) {
      h1.textContent = hero.headline;
    }
    wrap.appendChild(h1);

    if (hero.ledeHtml) {
      const p = el('p', 'lede');
      p.innerHTML = hero.ledeHtml;
      wrap.appendChild(p);
    } else if (hero.lede) {
      wrap.appendChild(el('p', 'lede', hero.lede));
    }

    if (Array.isArray(hero.cta) && hero.cta.length > 0) {
      const row = el('div', 'hero-cta');
      hero.cta.forEach((c) => {
        const a = document.createElement('a');
        a.className = `btn btn-${c.kind === 'primary' ? 'primary' : 'ghost'}`;
        a.href = c.href || '#';
        a.textContent = c.label || '';
        row.appendChild(a);
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function buildHeroCard(hero) {
    const aside = el('aside', 'hero-card');
    aside.setAttribute('aria-label', 'Métricas de impacto');
    aside.appendChild(el('h2', 'card-title', hero.cardTitle || 'Impacto acumulado'));

    const dl = el('dl', 'metric-grid');
    (hero.metrics || []).forEach((m) => {
      const div = el('div', 'metric');
      div.appendChild(el('dt', null, m.label || ''));
      const dd = el('dd');
      dd.appendChild(el('span', 'big', m.value || ''));
      div.appendChild(dd);
      dl.appendChild(div);
    });
    aside.appendChild(dl);
    return aside;
  }

  // ---------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------
  function renderOverview(ov) {
    const section = document.getElementById('overview');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;
    const head = mergeHead('overview', ov);
    const subHtml = head.sub ? '' : head.subHtml; // Notion sobrescreve HTML
    container.replaceChildren(
      buildSectionHead(head.kicker, head.title, subHtml || head.sub, !!subHtml),
      buildPillRow(ov.pills || []),
    );
  }

  function buildPillRow(pills) {
    const row = el('div', 'pill-row');
    pills.forEach((p) => row.appendChild(el('span', 'pill', p)));
    return row;
  }

  // ---------------------------------------------------------------------
  // Deliverables
  // ---------------------------------------------------------------------
  function renderDeliverables(d) {
    const section = document.getElementById('deliverables');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const frag = document.createDocumentFragment();
    const head = mergeHead('deliverables', d);
    frag.appendChild(buildSectionHead(head.kicker, head.title, head.sub));
    const sorted = [...(d.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    sorted.forEach((item) => frag.appendChild(buildDeliverable(item)));
    container.replaceChildren(frag);
  }

  function buildDeliverable(item) {
    const art = el('article', 'deliverable');
    if (item.id) art.id = item.id;

    const header = el('header', 'deliverable-head');
    header.appendChild(el('span', 'deliverable-num', item.num || ''));
    const box = el('div');
    box.appendChild(el('h3', null, item.title || ''));
    if (item.subHtml) {
      const p = el('p', 'deliverable-sub');
      p.innerHTML = item.subHtml;
      box.appendChild(p);
    } else if (item.sub) {
      box.appendChild(el('p', 'deliverable-sub', item.sub));
    }
    header.appendChild(box);
    art.appendChild(header);

    if (Array.isArray(item.blocks) && item.blocks.length > 0) {
      const grid = el('div', 'deliverable-grid');
      item.blocks.forEach((block) => grid.appendChild(buildBlock(block)));
      art.appendChild(grid);
    }

    if (item.table) art.appendChild(buildTableWrap(item.table));

    if (Array.isArray(item.metrics) && item.metrics.length > 0) {
      const ul = el('ul', 'metrics-row');
      item.metrics.forEach((m) => {
        const li = el('li');
        li.appendChild(el('span', 'check', '✅'));
        li.appendChild(document.createTextNode(' ' + m));
        ul.appendChild(li);
      });
      art.appendChild(ul);
    }
    const extrasNode = buildExtrasDl(item.extras);
    if (extrasNode) art.appendChild(extrasNode);
    return art;
  }

  function buildBlock(block) {
    const div = el('div');
    div.appendChild(el('h4', null, block.heading || ''));
    const ul = el('ul');
    if (Array.isArray(block.bulletsHtml)) {
      block.bulletsHtml.forEach((html) => {
        const li = el('li');
        li.innerHTML = html;
        ul.appendChild(li);
      });
    } else if (Array.isArray(block.bullets)) {
      block.bullets.forEach((text) => ul.appendChild(el('li', null, text)));
    }
    div.appendChild(ul);
    return div;
  }

  function buildTableWrap(table) {
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    if (table.caption) t.appendChild(el('caption', null, table.caption));
    if (Array.isArray(table.headers)) {
      const thead = el('thead');
      const tr = el('tr');
      table.headers.forEach((h) => {
        const th = el('th', null, h);
        th.setAttribute('scope', 'col');
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      t.appendChild(thead);
    }
    if (Array.isArray(table.rows)) {
      const tbody = el('tbody');
      table.rows.forEach((row) => {
        const tr = el('tr');
        row.forEach((cell, i) => {
          if (i === 0) {
            const th = el('th', null, cell);
            th.setAttribute('scope', 'row');
            tr.appendChild(th);
          } else {
            tr.appendChild(el('td', null, cell));
          }
        });
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
    }
    wrap.appendChild(t);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Influence
  // ---------------------------------------------------------------------
  function renderInfluence(inf) {
    const section = document.getElementById('influence');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const frag = document.createDocumentFragment();
    const head = mergeHead('influence', inf);
    frag.appendChild(buildSectionHead(head.kicker, head.title, head.sub));
    const ul = el('ul', 'adoption-list');
    const sorted = [...(inf.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    sorted.forEach((item) => {
      const li = el('li');
      li.appendChild(el('span', 'adoption-tag', item.tag || ''));
      if (item.bodyHtml) {
        const span = document.createElement('span');
        span.innerHTML = ' ' + item.bodyHtml;
        li.appendChild(span);
      } else if (item.body) {
        li.appendChild(document.createTextNode(' ' + item.body));
      }
      const chips = buildExtrasChips(item.extras);
      if (chips) li.appendChild(chips);
      ul.appendChild(li);
    });
    frag.appendChild(ul);
    container.replaceChildren(frag);
  }

  // ---------------------------------------------------------------------
  // Matrix — seção unificada: duas sub-tabelas (Skills e Progresso 2025)
  // num único cabeçalho editável via DB Site Sections (key=matrix).
  //
  // Sub-tabelas também têm headers próprios (H3) editáveis via Site Sections
  // usando as chaves `skills` e `progress`. Cada sub-tabela respeita seu
  // próprio `published` — é possível ocultar só skills ou só progresso
  // mantendo o bloco matrix visível.
  // ---------------------------------------------------------------------
  function renderMatrix(skills, progress) {
    const section = document.getElementById('matrix');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const head = mergeHead('matrix', {
      kicker: '05 · Skills & Progresso',
      title: 'Gap para Staff e status 2025',
    });
    const frag = document.createDocumentFragment();
    frag.appendChild(buildSectionHead(head.kicker, head.title, head.sub));

    const skillsMeta = sectionMeta('skills');
    if (skills && (!skillsMeta || skillsMeta.published !== false)) {
      frag.appendChild(
        buildMatrixSubgroup({
          anchorId: 'skills',
          head: mergeHead('skills', {
            title: 'Skill matrix — gap para Staff',
            sub: (skills && skills.sub) || '',
          }),
          table: buildSkillsTable(skills),
        }),
      );
    }

    const progressMeta = sectionMeta('progress');
    if (progress && (!progressMeta || progressMeta.published !== false)) {
      frag.appendChild(
        buildMatrixSubgroup({
          anchorId: 'progress',
          head: mergeHead('progress', {
            title: 'Progresso 2025 — status das dimensões',
            sub: (progress && progress.sub) || '',
          }),
          table: buildProgressTable(progress),
        }),
      );
    }

    container.replaceChildren(frag);
  }

  function buildMatrixSubgroup({ anchorId, head, table }) {
    const wrap = el('div', 'matrix-subgroup');
    if (anchorId) {
      // Âncora interna para preservar deep-links antigos (#skills, #progress)
      const anchor = document.createElement('span');
      anchor.id = anchorId;
      anchor.className = 'matrix-anchor';
      wrap.appendChild(anchor);
    }
    const sub = el('header', 'matrix-subhead');
    if (head.title) sub.appendChild(el('h3', 'matrix-subtitle', head.title));
    if (head.sub) sub.appendChild(el('p', 'matrix-subdesc', head.sub));
    wrap.appendChild(sub);
    wrap.appendChild(table);
    return wrap;
  }

  function buildSkillsTable(s) {
    const rows = [...((s && s.rows) || [])].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );
    const extraCols = unionExtraColumns(rows);
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    const headers = [
      'Skill', 'Nível atual', 'Esperado (Staff)', 'Gap', 'Plano de fechamento',
    ].concat(extraCols.map((c) => c.label));
    t.appendChild(buildThead(headers));
    const tbody = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr');
      const th = el('th', null, r.skill || '');
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      const tdCur = el('td');
      tdCur.appendChild(badgeNode(r.currentBadge, r.current));
      tr.appendChild(tdCur);
      tr.appendChild(el('td', null, r.target || ''));
      const tdGap = el('td');
      tdGap.appendChild(badgeNode(r.gapBadge, r.gap));
      tr.appendChild(tdGap);
      tr.appendChild(el('td', null, r.plan || ''));
      appendExtraCells(tr, r.extras, extraCols);
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function buildProgressTable(p) {
    const rows = [...((p && p.rows) || [])].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );
    const extraCols = unionExtraColumns(rows);
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    const headers = ['Dimensão', 'Status', 'Target 2025', 'Evidência'].concat(
      extraCols.map((c) => c.label),
    );
    t.appendChild(buildThead(headers));
    const tbody = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr');
      const th = el('th', null, r.dimension || '');
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      const td1 = el('td');
      td1.appendChild(badgeNode(r.status, r.statusLabel));
      tr.appendChild(td1);
      tr.appendChild(el('td', null, r.target || ''));
      const td3 = el('td');
      if (r.evidenceHtml) td3.innerHTML = r.evidenceHtml;
      else td3.textContent = r.evidence || '';
      tr.appendChild(td3);
      appendExtraCells(tr, r.extras, extraCols);
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function buildThead(headers) {
    const thead = el('thead');
    const trh = el('tr');
    headers.forEach((h) => {
      const th = el('th', null, h);
      th.setAttribute('scope', 'col');
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    return thead;
  }

  // ---------------------------------------------------------------------
  // Initiatives
  // ---------------------------------------------------------------------
  function renderInitiatives(ini) {
    const section = document.getElementById('next');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const grid = el('div', 'initiative-grid');
    const sorted = [...(ini.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    sorted.forEach((item) => {
      const art = el('article', 'initiative');
      if (item.tag) art.appendChild(el('span', 'initiative-tag', item.tag));
      art.appendChild(el('h3', null, item.title || ''));
      const hasFields = Array.isArray(item.fields) && item.fields.length > 0;
      const hasExtras = Array.isArray(item.extras) && item.extras.length > 0;
      if (hasFields || hasExtras) {
        const dl = el('dl');
        if (hasFields) {
          item.fields.forEach((f) => {
            dl.appendChild(el('dt', null, f.label || ''));
            dl.appendChild(el('dd', null, f.value || ''));
          });
        }
        if (hasExtras) {
          item.extras.forEach((ex) => {
            dl.appendChild(el('dt', null, ex.label || ''));
            dl.appendChild(buildExtraDd(ex));
          });
        }
        art.appendChild(dl);
      }
      grid.appendChild(art);
    });

    const head = mergeHead('next', ini);
    container.replaceChildren(buildSectionHead(head.kicker, head.title, head.sub), grid);
  }

  // ---------------------------------------------------------------------
  // Committee
  // ---------------------------------------------------------------------
  function renderCommittee(c) {
    const section = document.getElementById('committee');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const head = mergeHead('committee', { title: c.title });
    const callout = el('div', 'callout');
    callout.appendChild(el('h2', null, head.title || 'Observações para o comitê'));
    (c.paragraphs || []).forEach((html) => {
      const p = el('p');
      p.innerHTML = html;
      callout.appendChild(p);
    });
    container.replaceChildren(callout);
  }

  // ---------------------------------------------------------------------
  // CV snapshot
  // ---------------------------------------------------------------------
  function renderCV(cv) {
    const section = document.getElementById('cv');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const meta = mergeHead('cv', cv);
    const head = el('header', 'section-head section-head-cv');
    head.appendChild(el('span', 'section-kicker', meta.kicker || '09 · CV snapshot'));
    head.appendChild(el('h2', null, meta.title || 'One-pager do currículo'));
    if (meta.sub) {
      const sub = el('p', 'section-sub no-print');
      sub.textContent = meta.sub;
      head.appendChild(sub);
    }

    const card = el('article', 'cv-card');
    card.setAttribute('aria-labelledby', 'cv-name');

    // Header
    const cvHead = el('header', 'cv-header');
    const left = el('div');
    const h3 = el('h3', 'cv-name', cv.name || '');
    h3.id = 'cv-name';
    left.appendChild(h3);
    if (cv.role) left.appendChild(el('p', 'cv-title', cv.role));
    if (cv.summary) left.appendChild(el('p', 'cv-summary', cv.summary));
    cvHead.appendChild(left);

    const contact = el('ul', 'cv-contact');
    (cv.contact || []).forEach((c) => {
      const li = el('li');
      li.appendChild(el('span', null, `${c.label}:`));
      li.appendChild(document.createTextNode(' '));
      if (c.href) {
        const a = document.createElement('a');
        a.href = c.href;
        a.textContent = c.value;
        li.appendChild(a);
      } else {
        li.appendChild(document.createTextNode(c.value || ''));
      }
      contact.appendChild(li);
    });
    cvHead.appendChild(contact);
    card.appendChild(cvHead);

    // Body
    const body = el('div', 'cv-body');

    const col1 = el('section', 'cv-col');
    col1.appendChild(el('h4', null, 'Entregáveis & resultados'));
    const delivs = el('ul', 'cv-delivs');
    (cv.deliverables || []).forEach((d) => {
      const li = el('li');
      const strong = el('strong', null, d.title || '');
      li.appendChild(strong);
      li.appendChild(document.createTextNode(' — ' + (d.detail || '')));
      delivs.appendChild(li);
    });
    col1.appendChild(delivs);
    body.appendChild(col1);

    const col2 = el('section', 'cv-col');
    col2.appendChild(el('h4', null, 'Stack & competências'));
    const stack = el('ul', 'cv-stack');
    (cv.stack || []).forEach((row) => {
      const li = el('li');
      row.forEach((chip) => li.appendChild(el('span', 'cv-chip', chip)));
      stack.appendChild(li);
    });
    col2.appendChild(stack);

    col2.appendChild(el('h4', null, 'Impacto em números'));
    const kpis = el('ul', 'cv-kpis');
    (cv.kpis || []).forEach((k) => {
      const li = el('li');
      li.appendChild(el('span', 'cv-kpi-val', k.value || ''));
      li.appendChild(el('span', 'cv-kpi-lbl', k.label || ''));
      kpis.appendChild(li);
    });
    col2.appendChild(kpis);
    body.appendChild(col2);

    card.appendChild(body);

    const foot = el('footer', 'cv-footer');
    foot.appendChild(el('span', null, 'Atualizado · 2025'));
    foot.appendChild(el('span', null, 'rodckdev.github.io/portfolio'));
    card.appendChild(foot);

    container.replaceChildren(head, card);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // ---------------------------------------------------------------------
  // Extras — render de colunas dinâmicas vindas do Notion.
  // Contrato do item em site.json:
  //   { key, label, kind, value }
  // kind ∈ text | select | multi_select | number | url | checkbox | date
  // Se você adicionar uma coluna nova em qualquer DB do Notion e ela não
  // for nenhuma das colunas conhecidas (ver KNOWN no sync-notion.mjs), ela
  // cai aqui automaticamente. Sem mudar código.
  // ---------------------------------------------------------------------
  function buildExtrasDl(extras) {
    if (!Array.isArray(extras) || extras.length === 0) return null;
    const dl = el('dl', 'extras');
    extras.forEach((ex) => {
      dl.appendChild(el('dt', null, ex.label || ''));
      dl.appendChild(buildExtraDd(ex));
    });
    return dl;
  }

  function buildExtraDd(ex) {
    const dd = el('dd');
    renderExtraValue(dd, ex);
    return dd;
  }

  function buildExtrasChips(extras) {
    if (!Array.isArray(extras) || extras.length === 0) return null;
    const wrap = el('span', 'extras-chips');
    extras.forEach((ex) => {
      const chip = el('span', 'extras-chip');
      chip.appendChild(el('span', 'extras-chip-label', ex.label + ': '));
      renderExtraValue(chip, ex);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function renderExtraValue(target, ex) {
    const kind = ex && ex.kind;
    const v = ex ? ex.value : undefined;
    if (kind === 'url' && typeof v === 'string' && v) {
      const a = document.createElement('a');
      a.href = v;
      a.rel = 'noopener';
      a.target = '_blank';
      a.textContent = v.replace(/^mailto:/, '');
      target.appendChild(a);
      return;
    }
    if (kind === 'multi_select' && Array.isArray(v)) {
      v.forEach((label) => target.appendChild(el('span', 'extras-tag', label)));
      return;
    }
    if (kind === 'multi_link' && Array.isArray(v)) {
      v.forEach((link, i) => {
        if (i > 0) target.appendChild(document.createTextNode(' '));
        if (link.href) {
          const a = el('a', 'extras-tag extras-link');
          a.href = link.href;
          a.rel = 'noopener';
          a.target = '_blank';
          a.textContent = link.label || link.href;
          target.appendChild(a);
        } else {
          target.appendChild(el('span', 'extras-tag', link.label || ''));
        }
      });
      return;
    }
    if (kind === 'checkbox') {
      target.appendChild(document.createTextNode(v ? '✅' : '❌'));
      return;
    }
    if (kind === 'number' && v !== null && v !== undefined) {
      target.appendChild(
        document.createTextNode(
          Number.isFinite(v) ? v.toLocaleString('pt-BR') : String(v),
        ),
      );
      return;
    }
    if (v === null || v === undefined || v === '') return;
    target.appendChild(document.createTextNode(String(v)));
  }

  // União ordenada (preserva primeira ocorrência) de colunas extras entre
  // todas as linhas de uma tabela. Serve para skills e progress.
  function unionExtraColumns(rows) {
    const seen = new Map();
    (rows || []).forEach((r) => {
      (r.extras || []).forEach((ex) => {
        if (!seen.has(ex.key)) seen.set(ex.key, { key: ex.key, label: ex.label });
      });
    });
    return [...seen.values()];
  }

  function appendExtraCells(tr, extras, extraCols) {
    const byKey = new Map();
    (extras || []).forEach((ex) => byKey.set(ex.key, ex));
    extraCols.forEach((col) => {
      const td = el('td');
      const ex = byKey.get(col.key);
      if (ex) renderExtraValue(td, ex);
      tr.appendChild(td);
    });
  }

  function buildSectionHead(kicker, title, sub, subIsHtml) {
    const header = el('header', 'section-head');
    if (kicker) header.appendChild(el('span', 'section-kicker', kicker));
    if (title) header.appendChild(el('h2', null, title));
    if (sub) {
      const p = el('p', 'section-sub');
      if (subIsHtml) p.innerHTML = sub;
      else p.textContent = sub;
      header.appendChild(p);
    }
    return header;
  }

  function badgeNode(kind, label) {
    const cls = `badge badge-${normalizeBadge(kind)}`;
    return el('span', cls, label || '');
  }

  function normalizeBadge(kind) {
    const k = String(kind || '').toLowerCase();
    if (k === 'stable' || k === 'ok' || k === 'green') return 'ok';
    if (k === 'warn' || k === 'yellow') return 'warn';
    if (k === 'mid' || k === 'amber') return 'mid';
    if (k === 'err' || k === 'red' || k === 'error' || k === 'fail') return 'err';
    return 'warn';
  }
})();
