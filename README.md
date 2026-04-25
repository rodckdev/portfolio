# Rodrigo Kosai — Portfólio profissional

Site estático publicado via **GitHub Pages**:

👉 **https://rodckdev.github.io/portfolio/**

O conteúdo é **renderizado a partir de JSON** (`assets/data/site.json`) — o
HTML é só um esqueleto com contêineres vazios. Atualizar o site = editar o
JSON (via git) ou editar no **Notion** (7 DBs CMS que a GitHub Action sincroniza
diariamente). Não se mexe em HTML para publicar conteúdo.

## Seções

- **Hero** · métricas de impacto acumulado.
- **01 · Status geral** com pills.
- **02 · Entregas principais** — 5 cards descritivo/impacto/stakeholders.
- **03 · Influência cross-team** — padrões adotados por outros times.
- **04 · Dashboard de progresso** — status × target 2025.
- **05 · Skill matrix** — gap até Staff.
- **06 · Próximas iniciativas** — Q2/Q3.
- **07 · Projetos abertos** — feed GitHub (repos com topic `portfolio`).
- **08 · Posts publicados** — feed Notion DB `Portfólio` (Publicable=true).
- **Observações para o comitê.**
- **09 · CV snapshot** — one-pager imprimível.

## Arquitetura

```
┌──────────────────────┐ fetch client-side
│ GitHub REST API      │──────────────────────────────────┐
│ users/rodckdev/repos │    (topic = portfolio)           ▼
└──────────────────────┘                        ┌──────────────────┐
                                                │   index.html     │
┌──────────────────────┐  cron 03:00 UTC        │   (GH Pages)     │
│ Notion workspace     │  + dispatch manual     └────┬─────────────┘
│ ───────────────────  │                             ▲
│ DB "Portfólio"       │──► posts.json ──────────────┤
│ Site Deliverables    │──► site.json.deliverables ──┤
│ Site Skills          │──► site.json.skills ────────┤
│ Site Initiatives     │──► site.json.initiatives ───┤
│ Site Influence       │──► site.json.influence ─────┤
│ Site Progress        │──► site.json.progress ──────┤
│ Site KPIs            │──► hero.metrics + cv.kpis ──┤
│ Site CV Highlights   │──► cv.deliverables ─────────┘
└──────────────────────┘   (merge-update: só sobrescreve se houver items)
```

`assets/js/site.js` faz `fetch` em `assets/data/site.json` no load e
renderiza cada seção; `assets/js/feeds.js` continua cuidando dos feeds de
GitHub (live) e de posts (JSON commitado). Se o fetch falhar, a página exibe
um `<noscript>` callout apontando para o JSON.

## Estrutura de arquivos

```
.
├── index.html                           # Esqueleto dinâmico
├── assets/
│   ├── styles.css
│   ├── js/
│   │   ├── site.js                      # Renderer do site.json
│   │   └── feeds.js                     # Projetos (GitHub) + Posts (Notion)
│   └── data/
│       ├── site.json                    # Conteúdo do portfólio
│       └── posts.json                   # Gerado pelo Action
├── .github/
│   ├── scripts/
│   │   ├── package.json
│   │   ├── sync-notion.mjs              # Query Notion → site.json + posts.json
│   │   └── setup-site-dbs.mjs           # Bootstrap dos 7 DBs (roda 1x, local)
│   └── workflows/
│       └── sync-notion.yml              # Cron diário + dispatch manual
└── README.md
```

## Rodar localmente

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Editar conteúdo — 3 caminhos

### (a) Direto no git (mais rápido, nada de Notion)
Edite `assets/data/site.json` pela web do GitHub (celular também) ou via PR. A
cada push o GitHub Pages redeploya.

### (b) No Notion (mais "mobile-friendly")
Uma vez bootstrapped os DBs, basta abrir o Notion no celular, editar uma
página e esperar o Action rodar (ou `Run workflow` manualmente).

### (c) Pipeline `email → IA → Notion`
Envie email para o endpoint configurado em
[`email-to-notion-ai`](https://github.com/rodckdev/email-to-notion-ai) com
palavra-chave (`notion`/`interno`/`externo`); o pipeline estrutura via IA e
grava em `Atividades` + (se `publicavel=true`) em `Portfólio` → vira post.

## Bootstrap dos DBs no Notion (one-shot)

1. Pegue `NOTION_API_KEY` e `NOTION_PARENT_PAGE_ID` (a página onde os DBs
   serão criados — a integration precisa estar conectada a essa página).
2. Rode localmente:

   ```bash
   cd .github/scripts
   npm install
   NOTION_API_KEY=secret_xxx NOTION_PARENT_PAGE_ID=xxxxxxxx \
     node setup-site-dbs.mjs
   ```

   Cria 8 DBs (`Site Deliverables`, `Site Skills`, `Site Initiatives`,
   `Site Influence`, `Site Progress`, `Site KPIs`, `Site CV Highlights`,
   `Site Sections`) + seed com o conteúdo atual do `site.json`. Imprime os
   IDs no final.

   > Já tem os 7 DBs antigos e quer adicionar só o `Site Sections`? Use o
   > script dedicado para não duplicar:
   >
   > ```bash
   > NOTION_API_KEY=ntn_... NOTION_PARENT_PAGE_ID=... \
   >   node .github/scripts/setup-sections-db.mjs
   > ```

3. Salve os IDs como secrets no repo:

   ```bash
   gh secret set NOTION_DELIVERABLES_DB_ID  --repo rodckdev/portfolio
   gh secret set NOTION_SKILLS_DB_ID        --repo rodckdev/portfolio
   gh secret set NOTION_INITIATIVES_DB_ID   --repo rodckdev/portfolio
   gh secret set NOTION_INFLUENCE_DB_ID     --repo rodckdev/portfolio
   gh secret set NOTION_PROGRESS_DB_ID      --repo rodckdev/portfolio
   gh secret set NOTION_KPIS_DB_ID          --repo rodckdev/portfolio
   gh secret set NOTION_CV_HIGHLIGHTS_DB_ID --repo rodckdev/portfolio
   gh secret set NOTION_SECTIONS_DB_ID      --repo rodckdev/portfolio
   ```

4. (Se ainda não tiver) os secrets originais:

   ```bash
   gh secret set NOTION_API_KEY         --repo rodckdev/portfolio
   gh secret set NOTION_PORTFOLIO_DB_ID --repo rodckdev/portfolio
   ```

5. Dispare o Action: `gh workflow run sync-notion.yml --repo rodckdev/portfolio`.

## Secrets necessários no repo

| Secret                      | Alimenta                              | Obrigatório?         |
| --------------------------- | ------------------------------------- | -------------------- |
| `NOTION_API_KEY`            | todo o sync                           | Sim, para qualquer DB |
| `NOTION_PORTFOLIO_DB_ID`    | `posts.json` (DB Portfólio)           | Opcional              |
| `NOTION_DELIVERABLES_DB_ID` | `site.json.deliverables`              | Opcional              |
| `NOTION_SKILLS_DB_ID`       | `site.json.skills`                    | Opcional              |
| `NOTION_INITIATIVES_DB_ID`  | `site.json.initiatives`               | Opcional              |
| `NOTION_INFLUENCE_DB_ID`    | `site.json.influence`                 | Opcional              |
| `NOTION_PROGRESS_DB_ID`     | `site.json.progress`                  | Opcional              |
| `NOTION_KPIS_DB_ID`         | `hero.metrics` + `cv.kpis`            | Opcional              |
| `NOTION_CV_HIGHLIGHTS_DB_ID`| `cv.deliverables` (one-pager)         | Opcional              |
| `NOTION_SECTIONS_DB_ID`     | `sections.<key>` (kicker/title/sub + publish toggle) | Opcional |

Cada DB é opcional e independente. DB ausente ou vazio ⇒ `sync-notion.mjs`
**não mexe** naquela seção (preserva o que está comitado em `site.json`).

Política de segredos — onde vivem, como rotacionar, scanner de commits: ver
[SECURITY.md](./SECURITY.md).

## Hero "Impacto acumulado" e CV one-pager — também são dinâmicos

Os blocos que antes eram fixos no `site.json` (KPIs do hero e destaques do
one-pager) passam a ser editados no Notion via dois DBs dedicados.

### `Site KPIs` — alimenta hero **e** CV com o mesmo registro

Cada linha do DB é **um KPI** (ex: `Economia anual → USD 11M+`). Duas colunas
de ordem controlam onde o KPI aparece:

| Coluna      | Tipo       | Efeito                                                  |
| ----------- | ---------- | ------------------------------------------------------- |
| `Name`      | title      | Label do KPI ("Economia anual", "Uptime plataforma"…)  |
| `Value`     | rich_text  | Valor exibido ("USD 11M+", "250TB+", "99,99%"…)         |
| `HeroOrder` | number     | Posição no card do hero. **Vazio = não aparece no hero**|
| `CvOrder`   | number     | Posição no grid do one-pager. **Vazio = não aparece no CV** |
| `Published` | checkbox   | Obrigatório marcar para o sync puxar                    |

Exemplos:

- **Em ambos**: `HeroOrder=1`, `CvOrder=1` → aparece no hero e no CV.
- **Só no hero**: preenche `HeroOrder`, deixa `CvOrder` vazio.
- **Só no CV**: inverte.
- **Adicionar um 7º KPI**: cria linha nova com `HeroOrder=7` (ou `CvOrder=7`)
  e pronto — aparece sem mexer em código. Layout reflowa sozinho.

### `Site CV Highlights` — lista de destaques do one-pager

Alimenta o bloco **"Destaques"** do CV (antes `cv.deliverables`).

| Coluna      | Tipo       | Efeito                                              |
| ----------- | ---------- | --------------------------------------------------- |
| `Name`      | title      | Título do destaque ("HA multi-site Splunk"…)        |
| `Detail`    | rich_text  | Descrição curta, 1–2 linhas (impacto + escala)      |
| `Order`     | number     | Ordenação                                           |
| `Published` | checkbox   | Obrigatório marcar para o sync puxar                |

Novo destaque = criar linha, marcar `Published`, rodar o Action.

## Títulos de seção + publicar/despublicar por seção — via `Site Sections`

Cada bloco do site (Visão geral, Entregas, Influência, Skills & Progresso,
Próximas, CV…) agora tem **cabeçalho editável pelo Notion** e um **toggle
de publish** por seção. Uma linha do DB `Site Sections` = uma seção do site.

| Coluna      | Tipo       | Efeito                                                   |
| ----------- | ---------- | -------------------------------------------------------- |
| `Name`      | title      | Chave da seção (ex: `deliverables`, `matrix`, `cv`…)    |
| `Kicker`    | rich_text  | Texto pequeno acima do título (ex: `02 · Entregas`)     |
| `Title`     | rich_text  | Título grande do bloco                                   |
| `Sub`       | rich_text  | Subtítulo/descrição opcional                             |
| `Published` | checkbox   | **Desmarcar = seção inteira some do site**              |

**Chaves válidas** (use exatamente, minúsculas): `overview`, `deliverables`,
`influence`, `matrix`, `skills`, `progress`, `initiatives`, `committee`, `cv`.

**Casos de uso:**

- **Renomear o bloco "05 · Skill matrix"** → abre a linha `matrix`, muda
  `Kicker` para `05 · Skills & Progresso` e `Title` para `Gap para Staff e
  status 2025`. Rodar o Action → refresh.
- **Esconder a seção de comitê** enquanto você reescreve → abre a linha
  `committee`, desmarca `Published`. O site some com a seção inteira.
  Remarcar devolve.
- **Campo vazio no Notion** = usa o fallback estático em `site.json`. Ou seja,
  só edita o que você quer mudar — não precisa preencher todos os campos.

### Consolidação Skills + Progresso

A seção antiga "04 · Dashboard de progresso" + "05 · Skill matrix" virou uma
só, `#matrix`, com duas sub-tabelas empilhadas sob um cabeçalho comum:

- Cabeçalho principal (kicker/title/sub) → linha `matrix` no `Site Sections`.
- Sub-título da tabela de Skills → linha `skills` (Title = H3 da sub-tabela).
- Sub-título da tabela de Progresso → linha `progress` (idem).
- `Published=false` em `skills` esconde **só** a sub-tabela de skills; em
  `progress` idem. Em `matrix` esconde **o bloco inteiro**.

Âncoras `#skills` e `#progress` continuam funcionando como deep-links
internos para cada sub-tabela.

### O que segue em `site.json` (não vem do Notion)

Para manter o escopo enxuto, esses campos ficam em `site.json` e só mudam via
git/PR — mudança é rara:

- `hero.headlineParts`, `hero.ledeHtml`, `hero.cta`, `hero.cardTitle`
- `cv.name`, `cv.role`, `cv.summary`, `cv.contact` (Período, Escala, Email, GitHub)
- `cv.stack` (grupos de tags: Splunk HA / AWS / Datadog…)
- `cv.footerHtml`

Se quiser promover algum desses ao Notion depois (ex: stack dinâmico), pinga que codifico.

## Adicionar uma nova coluna no Notion e ver no site (sem mexer em código)

O sync extrai automaticamente qualquer propriedade que você criar em qualquer
um dos DBs do CMS. Basta criar a coluna no Notion, preencher nas páginas
que você quer publicar, e rodar o Action — o valor aparece no site na próxima
sincronização.

### Tipos suportados (e como renderizam)

| Tipo no Notion   | Onde aparece nos cards (Entregas / Iniciativas) | Onde aparece nas tabelas (Skills / Progresso) | Observação                |
| ---------------- | ----------------------------------------------- | --------------------------------------------- | ------------------------- |
| `Text`           | Linha `Label: valor`                            | Coluna nova com o valor                       | Vazio = oculta a linha    |
| `Select`         | Linha `Label: opção`                            | Coluna nova com o texto da opção              | —                         |
| `Multi-select`   | Chips coloridos                                 | Chips dentro da célula                        | —                         |
| `Number`         | Número formatado pt-BR                          | Mesmo                                         | —                         |
| `URL` / `Email`  | Link clicável (`target=_blank`)                 | Link clicável                                 | Email vira `mailto:`      |
| `Phone`          | Texto simples                                   | Texto simples                                 | —                         |
| `Checkbox`       | ✅ / ❌                                          | ✅ / ❌                                         | —                         |
| `Date`           | `início → fim` ou `início`                     | Mesmo                                         | Data range se tiver `end` |

Na seção **Influência** os extras viram *chips* depois do corpo do item.

### Passo a passo — exemplo: adicionar coluna `Timeline` em Iniciativas

1. No Notion, abra o DB `Site Initiatives` → **+** no header → **Text** →
   nome `Timeline`.
2. Preencha em uma ou mais páginas (ex: `Q2 2025 → Q3 2025`).
3. Marque `Published` na(s) página(s).
4. Rode o Action (ou espere o cron):
   `gh workflow run sync-notion.yml --repo rodckdev/portfolio`
5. Em ~1 min o site mostra `Timeline: Q2 2025 → Q3 2025` no card da iniciativa.

### Tipos **não** suportados (e por quê)

`Title` (é o `Name`, já consumido), `Files`, `People`, `Relation`, `Rollup`,
`Formula`, `Created time/by`, `Last edited time/by` — precisam de resolução
extra (upload, lookup) que foge do escopo. Se você precisar de algum, abre
uma issue no repo.

### Como o sync sabe o que é "conhecido" vs "extra"

Em `.github/scripts/sync-notion.mjs`, o objeto `KNOWN` lista as propriedades
que cada função `syncX` consome diretamente (ex. `Name`, `Order`, `Body`,
`WhatWasDone`…). **Tudo fora dessa lista** vira `extras` no item e o
renderer em `assets/js/site.js` cuida do resto. Se você quiser "promover"
uma coluna extra a um campo destacado (com posição custom, badge, etc.),
aí sim é código — pingar que eu codifico.

### Chaves de item geradas pelo sync (para lembrar de não usar como label)

`id`, `order`, `title`, `num`, `sub`, `blocks`, `metrics`, `tag`, `body`,
`skill`, `current`, `currentBadge`, `target`, `gap`, `gapBadge`, `plan`,
`dimension`, `status`, `statusLabel`, `evidence`, `fields`, `extras`.

## Publicar um projeto na seção "Projetos abertos"

Em **Settings → Topics** do repo, adicione `portfolio`. A seção puxa direto
da API pública do GitHub.

## Imprimir o currículo

Clique em **"Imprimir / PDF"** no cabeçalho (ou `Ctrl/⌘ + P`). A folha de
estilo de impressão oculta tudo exceto o CV snapshot → PDF limpo pronto para
anexar em candidaturas.
