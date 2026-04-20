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

    if (data.meta) applyMeta(data.meta);
    if (data.hero) renderHero(data.hero);
    if (data.overview) renderOverview(data.overview);
    if (data.deliverables) renderDeliverables(data.deliverables);
    if (data.influence) renderInfluence(data.influence);
    if (data.progress) renderProgress(data.progress);
    if (data.skills) renderSkills(data.skills);
    if (data.initiatives) renderInitiatives(data.initiatives);
    if (data.committee) renderCommittee(data.committee);
    if (data.cv) renderCV(data.cv);
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
    container.replaceChildren(
      buildSectionHead(ov.kicker, ov.title, ov.subHtml || ov.sub, !!ov.subHtml),
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
    frag.appendChild(buildSectionHead(d.kicker, d.title, d.sub));
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
    frag.appendChild(buildSectionHead(inf.kicker, inf.title, inf.sub));
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
      ul.appendChild(li);
    });
    frag.appendChild(ul);
    container.replaceChildren(frag);
  }

  // ---------------------------------------------------------------------
  // Progress dashboard
  // ---------------------------------------------------------------------
  function renderProgress(p) {
    const section = document.getElementById('progress');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    const headers = ['Dimensão', 'Status', 'Target 2025', 'Evidência'];
    const thead = el('thead');
    const trh = el('tr');
    headers.forEach((h) => {
      const th = el('th', null, h);
      th.setAttribute('scope', 'col');
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);

    const tbody = el('tbody');
    const sorted = [...(p.rows || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    sorted.forEach((r) => {
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

      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);

    container.replaceChildren(buildSectionHead(p.kicker, p.title, p.sub), wrap);
  }

  // ---------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------
  function renderSkills(s) {
    const section = document.getElementById('skills');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const wrap = el('div', 'table-wrap');
    const t = el('table', 'data-table');
    const headers = ['Skill', 'Nível atual', 'Esperado (Staff)', 'Gap', 'Plano de fechamento'];
    const thead = el('thead');
    const trh = el('tr');
    headers.forEach((h) => {
      const th = el('th', null, h);
      th.setAttribute('scope', 'col');
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);

    const tbody = el('tbody');
    const sorted = [...(s.rows || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    sorted.forEach((r) => {
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
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);

    container.replaceChildren(buildSectionHead(s.kicker, s.title, s.sub), wrap);
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
      if (Array.isArray(item.fields) && item.fields.length > 0) {
        const dl = el('dl');
        item.fields.forEach((f) => {
          dl.appendChild(el('dt', null, f.label || ''));
          dl.appendChild(el('dd', null, f.value || ''));
        });
        art.appendChild(dl);
      }
      grid.appendChild(art);
    });

    container.replaceChildren(buildSectionHead(ini.kicker, ini.title, ini.sub), grid);
  }

  // ---------------------------------------------------------------------
  // Committee
  // ---------------------------------------------------------------------
  function renderCommittee(c) {
    const section = document.getElementById('committee');
    if (!section) return;
    const container = section.querySelector('.container');
    if (!container) return;

    const callout = el('div', 'callout');
    callout.appendChild(el('h2', null, c.title || 'Observações para o comitê'));
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

    const head = el('header', 'section-head section-head-cv');
    head.appendChild(el('span', 'section-kicker', cv.kicker || '09 · CV snapshot'));
    head.appendChild(el('h2', null, cv.title || 'One-pager do currículo'));
    if (cv.sub) {
      const sub = el('p', 'section-sub no-print');
      sub.textContent = cv.sub;
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
