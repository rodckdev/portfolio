# Rodrigo Kosai — Portfólio profissional

Site estático publicado via **GitHub Pages**:

👉 **https://rodckdev.github.io/portfolio/**

O conteúdo é **renderizado a partir de JSON** (`assets/data/site.json`) — o
HTML é só um esqueleto com contêineres vazios. Atualizar o site = editar o
JSON (via git) ou editar no **Notion** (5 DBs CMS que a GitHub Action sincroniza
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
│ Site Progress        │──► site.json.progress ──────┘
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
│   │   └── setup-site-dbs.mjs           # Bootstrap dos 5 DBs (roda 1x, local)
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

   Cria 5 DBs (`Site Deliverables`, `Site Skills`, `Site Initiatives`,
   `Site Influence`, `Site Progress`) + seed com o conteúdo atual do
   `site.json`. Imprime os 5 IDs no final.

3. Salve os IDs como secrets no repo:

   ```bash
   gh secret set NOTION_DELIVERABLES_DB_ID --repo rodckdev/portfolio
   gh secret set NOTION_SKILLS_DB_ID       --repo rodckdev/portfolio
   gh secret set NOTION_INITIATIVES_DB_ID  --repo rodckdev/portfolio
   gh secret set NOTION_INFLUENCE_DB_ID    --repo rodckdev/portfolio
   gh secret set NOTION_PROGRESS_DB_ID     --repo rodckdev/portfolio
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

Cada DB é opcional e independente. DB ausente ou vazio ⇒ `sync-notion.mjs`
**não mexe** naquela seção (preserva o que está comitado em `site.json`).

Política de segredos — onde vivem, como rotacionar, scanner de commits: ver
[SECURITY.md](./SECURITY.md).

## Publicar um projeto na seção "Projetos abertos"

Em **Settings → Topics** do repo, adicione `portfolio`. A seção puxa direto
da API pública do GitHub.

## Imprimir o currículo

Clique em **"Imprimir / PDF"** no cabeçalho (ou `Ctrl/⌘ + P`). A folha de
estilo de impressão oculta tudo exceto o CV snapshot → PDF limpo pronto para
anexar em candidaturas.
