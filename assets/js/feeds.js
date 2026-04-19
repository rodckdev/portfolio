// feeds.js — lê GitHub (client-side) e posts.json (gerado por GitHub Action) e
// renderiza as seções "Projetos" e "Posts". Sem dependências externas.
//
// Dois data-sources independentes: se um falhar, o outro continua renderizando.
// Todas as chamadas fazem fallback para estados vazio / erro visíveis.

(function () {
  'use strict';

  const PROJECTS_GRID = document.getElementById('projects-grid');
  const POSTS_GRID = document.getElementById('posts-grid');
  const POSTS_UPDATED = document.getElementById('posts-updated');

  if (PROJECTS_GRID) loadProjects(PROJECTS_GRID);
  if (POSTS_GRID) loadPosts(POSTS_GRID, POSTS_UPDATED);

  // -----------------------------------------------------------------------
  // GitHub — repos públicos do usuário com a topic configurada
  // -----------------------------------------------------------------------
  async function loadProjects(grid) {
    const user = grid.dataset.githubUser;
    const topic = (grid.dataset.topic || '').toLowerCase();
    if (!user) return renderError(grid, 'Usuário do GitHub não configurado.');

    try {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(
          user,
        )}/repos?per_page=100&sort=updated`,
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (!res.ok) {
        throw new Error(`GitHub API respondeu ${res.status}`);
      }
      const repos = await res.json();
      const filtered = repos
        .filter((r) => !r.archived && !r.disabled)
        .filter((r) =>
          topic ? (r.topics || []).map((t) => t.toLowerCase()).includes(topic) : true,
        )
        .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '';

      if (filtered.length === 0) {
        grid.appendChild(
          stateNode(
            topic
              ? `Nenhum repositório público de @${user} com a topic "${topic}" ainda. Adicione a topic em Settings → Topics no GitHub para ver aqui.`
              : `Nenhum repositório público encontrado para @${user}.`,
          ),
        );
        return;
      }

      for (const repo of filtered) {
        grid.appendChild(renderRepoCard(repo));
      }
    } catch (err) {
      console.error('[feeds.js] projects error:', err);
      renderError(
        grid,
        'Não foi possível carregar os repositórios do GitHub. Tente recarregar a página.',
      );
    }
  }

  function renderRepoCard(repo) {
    const card = document.createElement('article');
    card.className = 'project-card';

    const title = document.createElement('h3');
    const link = document.createElement('a');
    link.href = repo.html_url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = repo.name;
    title.appendChild(link);

    const desc = document.createElement('p');
    desc.className = 'project-desc';
    desc.textContent = repo.description || 'Sem descrição.';

    const meta = document.createElement('ul');
    meta.className = 'project-meta';

    if (repo.language) {
      const li = document.createElement('li');
      li.className = 'project-meta-lang';
      li.textContent = repo.language;
      meta.appendChild(li);
    }
    const stars = document.createElement('li');
    stars.textContent = `★ ${repo.stargazers_count}`;
    meta.appendChild(stars);
    const forks = document.createElement('li');
    forks.textContent = `⑂ ${repo.forks_count}`;
    meta.appendChild(forks);
    const upd = document.createElement('li');
    upd.className = 'project-meta-updated';
    upd.textContent = `atualizado ${relativeTime(repo.pushed_at)}`;
    meta.appendChild(upd);

    const topics = document.createElement('ul');
    topics.className = 'project-topics';
    for (const t of (repo.topics || []).slice(0, 6)) {
      const li = document.createElement('li');
      li.textContent = t;
      topics.appendChild(li);
    }

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(meta);
    if (topics.children.length > 0) card.appendChild(topics);
    return card;
  }

  // -----------------------------------------------------------------------
  // Notion — posts.json gerado pela GitHub Action
  // -----------------------------------------------------------------------
  async function loadPosts(grid, updatedLabel) {
    const src = grid.dataset.postsSrc || 'assets/data/posts.json';
    try {
      const res = await fetch(src, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`posts.json respondeu ${res.status}`);
      const payload = await res.json();

      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = '';

      if (updatedLabel) {
        updatedLabel.textContent = payload.updated
          ? `${formatDate(payload.updated)} (${relativeTime(payload.updated)})`
          : 'ainda não sincronizado';
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length === 0) {
        grid.appendChild(
          stateNode(
            'Nenhum post publicado ainda. Marque uma entrada como Publicable=true no DB Portfólio do Notion — o Action diário traz para cá.',
          ),
        );
        return;
      }

      for (const item of items) {
        grid.appendChild(renderPostCard(item));
      }
    } catch (err) {
      console.error('[feeds.js] posts error:', err);
      if (updatedLabel) updatedLabel.textContent = 'erro ao carregar';
      renderError(
        grid,
        'Não foi possível carregar os posts. Verifique se o Action de sincronização já rodou ao menos uma vez.',
      );
    }
  }

  function renderPostCard(p) {
    const card = document.createElement('article');
    card.className = 'post-card';

    const header = document.createElement('header');
    const cat = document.createElement('span');
    cat.className = 'post-category';
    cat.textContent = p.category || 'geral';
    const title = document.createElement('h3');
    if (p.url) {
      const a = document.createElement('a');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = p.title || 'Sem título';
      title.appendChild(a);
    } else {
      title.textContent = p.title || 'Sem título';
    }
    header.appendChild(cat);
    header.appendChild(title);

    const body = document.createElement('dl');
    body.className = 'post-body';
    appendField(body, 'Contexto', p.context);
    appendField(body, 'Problema', p.problem);
    appendField(body, 'Solução', p.solution);
    appendField(body, 'Resultado', p.result);

    const foot = document.createElement('footer');
    foot.className = 'post-foot';
    if (p.technologies) {
      const techs = (p.technologies || '')
        .split(/[,;]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (techs.length) {
        const ul = document.createElement('ul');
        ul.className = 'post-tech';
        for (const t of techs) {
          const li = document.createElement('li');
          li.textContent = t;
          ul.appendChild(li);
        }
        foot.appendChild(ul);
      }
    }
    if (p.lastEdited) {
      const time = document.createElement('time');
      time.dateTime = p.lastEdited;
      time.textContent = relativeTime(p.lastEdited);
      foot.appendChild(time);
    }

    card.appendChild(header);
    card.appendChild(body);
    if (foot.children.length > 0) card.appendChild(foot);
    return card;
  }

  function appendField(dl, label, value) {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  function renderError(grid, message) {
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'feed-state feed-error';
    p.textContent = message;
    grid.appendChild(p);
  }

  function stateNode(message) {
    const p = document.createElement('p');
    p.className = 'feed-state feed-empty';
    p.textContent = message;
    return p;
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.round((now - then) / 1000);
    const abs = Math.abs(diffSec);
    const units = [
      ['ano', 365 * 24 * 3600],
      ['mês', 30 * 24 * 3600],
      ['sem', 7 * 24 * 3600],
      ['dia', 24 * 3600],
      ['h', 3600],
      ['min', 60],
    ];
    for (const [label, sec] of units) {
      if (abs >= sec) {
        const n = Math.floor(abs / sec);
        return diffSec >= 0 ? `há ${n} ${label}${n > 1 && label.length > 2 ? 's' : ''}` : `em ${n} ${label}`;
      }
    }
    return 'agora';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }
})();
