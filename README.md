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
- **Observações para o comitê.**
- **CV snapshot** — card imprimível que vira um one-pager em PDF.

## Stack

- HTML5 + CSS puro (sem framework) — carrega em < 50 KB.
- Tipografia Inter + JetBrains Mono via Google Fonts.
- Favicon SVG inline.
- JS mínimo (IntersectionObserver para o link ativo da navegação).
- CSS de impressão otimizado para gerar PDF do CV (Ctrl/⌘ + P → "Salvar como PDF").

## Estrutura

```
.
├── index.html          # Página única com todas as seções
├── assets/
│   ├── styles.css      # Design system (paleta navy + dourado)
│   └── favicon.svg
├── .nojekyll           # Desativa processamento Jekyll no Pages
└── README.md
```

## Rodar localmente

```bash
# qualquer servidor HTTP estático, por exemplo:
python3 -m http.server 8080
# → http://localhost:8080
```

## Publicação

- Push em `main` → GitHub Pages faz build automaticamente a partir da branch root.
- Configurado em `Settings → Pages → Source = main / (root)`.

## Imprimir o currículo

Na página, clique em **"Imprimir / PDF"** no canto superior direito (ou `Ctrl/⌘ + P`). A folha de estilo de impressão oculta a navegação, o hero e as demais seções, deixando apenas o **CV snapshot** em formato A4 — pronto para anexar em candidaturas.

## Licença

Conteúdo © 2025 Rodrigo Kosai. Código do site livre para reutilização.
