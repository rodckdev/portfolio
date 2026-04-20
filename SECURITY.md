# Security — gestão de segredos

## Princípio
**Nenhum segredo ou ID operacional fica commitado.** Todo valor sensível vive
só em dois lugares: GitHub Actions secrets (para o workflow) ou no shell local
do mantenedor (para scripts one-shot como o bootstrap).

## Inventário de segredos do repo

Todos são **GitHub Actions secrets** configurados em
[Settings → Secrets → Actions](https://github.com/rodckdev/portfolio/settings/secrets/actions).
O workflow `.github/workflows/sync-notion.yml` os injeta como env vars em
runtime e **nunca** loga os valores (vem como `***` nos logs).

| Secret                          | Sensibilidade | Usa em            | Origem                         |
| ------------------------------- | ------------- | ----------------- | ------------------------------ |
| `NOTION_API_KEY`                | **alta**      | `sync-notion.mjs` | Notion integration → Settings → Integrations |
| `NOTION_PORTFOLIO_DB_ID`        | média         | `sync-notion.mjs` | setup do repo `email-to-notion-ai` |
| `NOTION_DELIVERABLES_DB_ID`     | média         | `sync-notion.mjs` | output de `setup-site-dbs.mjs` |
| `NOTION_SKILLS_DB_ID`           | média         | `sync-notion.mjs` | idem                           |
| `NOTION_INITIATIVES_DB_ID`      | média         | `sync-notion.mjs` | idem                           |
| `NOTION_INFLUENCE_DB_ID`        | média         | `sync-notion.mjs` | idem                           |
| `NOTION_PROGRESS_DB_ID`         | média         | `sync-notion.mjs` | idem                           |

Por que os **DB IDs são "média"** e não "baixa": sozinhos não abrem nada
(Notion exige o token + a integration estar conectada à página), mas se
combinados com o token conseguem ler/escrever nos DBs. Tratamos como segredo
por defesa em profundidade.

## Como rotacionar o `NOTION_API_KEY`

1. Notion → Settings & Members → **Connections** → aba **Developed integrations** → clicar na sua integration
2. Aba **Secrets** → **Regenerate integration secret** (não há download — copiar na hora)
3. Atualizar no GitHub:
   ```bash
   gh secret set NOTION_API_KEY --repo rodckdev/portfolio
   gh secret set NOTION_API_KEY --repo rodckdev/email-to-notion-ai
   ```
4. Disparar `gh workflow run sync-notion.yml --repo rodckdev/portfolio` e
   confirmar que roda sem 401.
5. O token anterior fica revogado automaticamente pelo Notion no passo 2.

## Como rotacionar um DB ID

DBs do Notion não têm rotação nativa (o ID vive enquanto o DB existe). Se você
suspeita que um ID vazou:

1. Criar um novo DB com o mesmo schema (o `setup-site-dbs.mjs` serve — rode
   com `--no-seed` se já tiver conteúdo)
2. Copiar o conteúdo do DB antigo para o novo (drag-and-drop no Notion)
3. Atualizar o secret correspondente no GitHub
4. Arquivar o DB antigo (Trash) — o ID fica inacessível após 30 dias

## Rodar localmente sem vazar

```bash
# NÃO FAÇA: exportar no shell e deixar no history
# export NOTION_API_KEY=secret_abc...

# FAÇA: passar inline num comando específico (não entra no history em muitos shells)
NOTION_API_KEY='...' NOTION_PARENT_PAGE_ID='...' \
  node .github/scripts/setup-site-dbs.mjs

# OU: usar um arquivo .env LOCAL (nunca commitado — está no .gitignore)
cat > .env.local <<EOF
NOTION_API_KEY=...
NOTION_PARENT_PAGE_ID=...
EOF
set -a; source .env.local; set +a
node .github/scripts/setup-site-dbs.mjs
```

## Camadas de defesa ativas no repo

1. **`.gitignore`** — bloqueia commit acidental de `.env*`, `*.pem`, `*.key`,
   `credentials.json`, `service-account*.json`, `*.tfvars`.
2. **Gitleaks workflow** (`.github/workflows/gitleaks.yml`) — escaneia cada
   PR, cada push em `main`, e uma vez por semana a base inteira (pega vazamento
   em branches antigos). Config em `.gitleaks.toml`.
3. **Actions secrets mascarados nos logs** — padrão do GitHub; valores
   aparecem como `***` em logs de workflow.
4. **Segredos isolados por repo** — `portfolio` e `email-to-notion-ai` têm
   secrets separados; comprometimento de um não cascata para o outro.

## Resposta a incidente — checklist curto

Se um secret vazar (chat, print, log externo, etc):

- [ ] Rotacionar imediatamente (seção "Como rotacionar" acima)
- [ ] Se o vazamento foi em commit: `git rebase -i` + force-push **não é
      suficiente** — o commit fica cached em forks/CI/mirror. O token ANTIGO
      precisa ser revogado na origem (Notion/GitHub), não só removido do git.
- [ ] Auditar Notion → Settings → Integrations → **Activity** (últimos 90
      dias de uso do token) e verificar requests estranhas.
- [ ] Revisar GitHub Actions runs recentes e logs externos onde o valor
      possa ter aparecido.

## Fora de escopo (não são segredos)

- O email de contato `rckosai81@gmail.com` é conteúdo público do site (vive em
  `assets/data/site.json` para os visitantes verem).
- Nomes de DBs (`Site Deliverables`, `Portfólio`, etc) não são sensíveis.
- IDs de repositório / PR / issue do GitHub são públicos por natureza.
