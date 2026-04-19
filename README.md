# Rodrigo Kosai — Portfólio profissional

Site estático publicado via **GitHub Pages**:

👉 **https://rodckdev.github.io/portfolio/**

Portfólio de carreira com:

- **Visão geral** e métricas de impacto acumulado (USD 11M+/ano, 250TB+/dia, 2.000+ users, 400+ EC2).
- **5 entregas principais** — HA multi-site Splunk, FinOps, Datadog APM + SLOs, automação / toil reduction e governance.
- **Influência cross-team** — padrões adotados por outros times.
- **Dashboard de progresso** — status atual × target 2025.
- **Skill matrix** — gap até nível Staff.
- **Próximas iniciativas Q2/Q3 2025** — OTEL, SLO framework, cross-team adoption.
- **Projetos abertos** — feed automático dos repos do GitHub com a topic `portfolio`.
- **Posts publicados** — feed automático do database `Portfólio` do Notion (entradas com `Publicable=true`).
- **Observações para o comitê.**
- **CV snapshot** — card imprimível que vira um one-pager em PDF.

## Stack

- HTML5 + CSS puro (sem framework).
- Tipografia Inter + JetBrains Mono via Google Fonts.
- JS mínimo: IntersectionObserver para o link ativo + fetch client-side para os feeds.
- CSS de impressão otimizado para gerar PDF do CV (Ctrl/⌘ + P → "Salvar como PDF").
- GitHub Actions para sincronizar posts do Notion.

## Estrutura

```
.
├── index.html                     # Página única com todas as seções
├── assets/
│   ├── styles.css                 # Design system (paleta navy + dourado)
│   ├── favicon.svg
│   ├── js/
│   │   └── feeds.js               # Render de Projetos (GitHub) + Posts (Notion)
│   └── data/
│       └── posts.json             # Gerado pelo GitHub Action (Notion → JSON)
├── .github/
│   ├── scripts/
│   │   ├── package.json
│   │   └── sync-notion.mjs        # Query do Notion, escreve posts.json
│   └── workflows/
│       └── sync-notion.yml        # Cron diário + dispatch manual
├── .nojekyll
└── README.md
```

## Arquitetura dos feeds

```
┌─────────────────────────┐   fetch client-side (60 req/h grátis)
│  GitHub REST API        │ ──────────────────────────────────┐
│  users/rodckdev/repos   │                                   ▼
└─────────────────────────┘                          ┌─────────────────┐
                                                     │   index.html    │
┌─────────────────────────┐                          │   (GH Pages)    │
│  Notion DB "Portfólio"  │                          └────────┬────────┘
│  Publicable = true      │                                   ▲
└─────────────┬───────────┘                                   │ lê posts.json estático
              ▼                                               │
   GitHub Actions (cron 03:00 UTC) ─ sync-notion.mjs ─ escreve e commita
```

## Rodar localmente

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

> O feed do GitHub funciona localmente (API pública). O feed do Notion só aparece se
> o GitHub Action já tiver rodado e commitado `assets/data/posts.json` — localmente
> você pode exportar as mesmas envs e rodar manualmente:
>
> ```bash
> cd .github/scripts
> npm install
> NOTION_API_KEY=secret_xxx NOTION_PORTFOLIO_DB_ID=xxx node sync-notion.mjs
> ```

## Publicar um projeto na seção "Projetos abertos"

No repo que quiser destacar, vá em **Settings → Topics** e adicione a topic
`portfolio`. O feed puxa direto da API do GitHub e aparece na próxima visita.

## Publicar um post na seção "Posts publicados"

1. Envie um email com a palavra-chave (`notion`/`interno`/`externo`) para o
   endpoint configurado no pipeline [`email-to-notion-ai`](https://github.com/rodckdev/email-to-notion-ai).
2. O pipeline estrutura via IA e grava no DB `Atividades`; se o item for
   `publicavel=true`, também grava em `Portfólio`.
3. O Action `Sync Notion posts` roda 03:00 UTC todo dia (ou via "Run workflow"
   manualmente) e traz os itens para `assets/data/posts.json`.
4. O commit gerado pelo Action força um redeploy do GitHub Pages.

Para entradas ficarem visíveis, a integration do Notion precisa estar conectada
à página que contém o database `Portfólio` (Notion → "..." → Connections).

## Secrets necessários no repo

| Secret                    | Para quê                                               |
| ------------------------- | ------------------------------------------------------ |
| `NOTION_API_KEY`          | Token da integration do Notion (mesma do email-to-notion-ai) |
| `NOTION_PORTFOLIO_DB_ID`  | ID do database "Portfólio"                             |

Configurar via GitHub UI (`Settings → Secrets and variables → Actions`) ou via
`gh` CLI:

```bash
gh secret set NOTION_API_KEY --repo rodckdev/portfolio
gh secret set NOTION_PORTFOLIO_DB_ID --repo rodckdev/portfolio
```

Sem esses secrets, o Action sai com exit 0 sem alterar nada e o site continua
funcionando — a seção de Posts mostra um estado vazio.

## Imprimir o currículo

Na página, clique em **"Imprimir / PDF"** no canto superior direito (ou `Ctrl/⌘ + P`).
A folha de estilo de impressão oculta a navegação, o hero e as demais seções,
deixando apenas o **CV snapshot** em formato A4 — pronto para anexar em candidaturas.

## Licença

Conteúdo © 2025 Rodrigo Kosai. Código do site livre para reutilização.
