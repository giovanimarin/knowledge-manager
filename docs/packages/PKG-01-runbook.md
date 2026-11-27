# PKG-01 — Operação local

## Instalar e iniciar

Pré-requisitos: Docker Engine com Compose v2 (ou Docker Desktop), Node 24 e Make, terminal Bash e curl. No Windows, usar WSL2 com integração Docker Desktop. Imagens e pacotes são baixados na primeira instalação. API, workers e dados usam rede Compose interna. Só a web é publicada em loopback por uma bridge IPv4 com NAT de saída desabilitado. O aplicativo inicia sem contas externas e sem API paga.

```bash
make doctor
make setup
make smoke
```

Abra `http://localhost:3000`. `KM_WEB_PORT=3107 make setup` troca a porta; mantenha a variável nas próximas chamadas. O setup gera dois segredos locais em `.env` (0600), inicializa papéis distintos, aplica migração idempotente, prepara storage e aguarda readiness. Preserve o arquivo enquanto usar os volumes. Configuração e passwords não são incluídos em backups. Para TLS interceptado por um proxy aprovado, use `KM_BUILD_CA=/caminho/ca-bundle.pem make setup`; BuildKit monta o bundle como segredo temporário e mantém validação TLS.

`make status` mostra saúde, `make logs` exibe logs, `make stop` pausa serviços preservando volumes e `make start` os retoma. `/healthz` indica processo respondendo, `/readyz` verifica PostgreSQL, migração, operador pgvector, Redis e storage, com erro agregado 503. O worker expõe as mesmas sondas somente internamente. A página React apresenta o estado e permite verificar novamente. O setup não cria conta de produto.

A migração usa advisory lock, transação e checksum. O bootstrap instala a extensão pgvector, o papel sem login `km_migrate` possui objetos da aplicação e `km_app` não tem DDL, bypass de RLS ou delegação de papel. Fixtures sintéticas exercitam duas partições, contexto ausente e escrita cruzada. Para laboratório **descartável**, com API e worker parados, o arquivo `/km-infra/rollback.sql` reverte v1; reaplicar com setup. Esse rollback remove as tabelas de fixture. Nunca usar contra dados a preservar.

## Backup e restauração

```bash
mkdir -p backups
make backup DIR=backups/snapshot-001
make stop
export COMPOSE_PROJECT_NAME=km-restore-lab KM_ENV_FILE=.env.restore KM_WEB_PORT=3107
make restore DIR=backups/snapshot-001
make smoke
make stop
```

O backup pausa API, worker e web, verifica vínculos e checksums, grava dump PostgreSQL, snapshot de objetos e manifesto em diretório temporário restrito, publica o diretório completo e retoma serviços. O restore requer projeto Compose novo e isolado, banco e storage vazios, checa a versão e SHA-256, valida política RLS, papeis, schema e vínculos antes de liberar tráfego. Uma restauração incompleta não fica pronta com start ou setup. Inspecione logs e repita em outro projeto descartável. Nunca restaure um pacote de origem não confiável; checksums verificam integridade, não autenticidade. Os snapshots locais não são cifrados; manter sob ACL de filesystem e usar apenas dados sintéticos nesta fundação. O empacotamento local carrega objetos em memória e se destina aos volumes pequenos da fundação.

Redis contém fila de trabalho e não é fonte de verdade do backup. O recibo de probe é idempotente; reconstrução de outbox e reprocesso de domínio são tratados nos pacotes de implementação responsáveis. Restore de produto exige revalidar tombstones e ACL antes de reabrir acesso. O teste sintético da fundação cobre a manutenção e a barreira de readiness, sem declarar recuperação de dados reais.

Volumes de laboratório podem ser removidos com `docker compose --env-file "$KM_ENV_FILE" down -v` **somente** quando o projeto descartável estiver selecionado e for seguro apagar dados. Um lock de operações evita concorrência entre comandos make do mesmo projeto na máquina; se o processo for morto e o lock persistir, confirme que não há operação ativa antes de remover o diretório em `${TMPDIR:-/tmp}/km-compose-<projeto>.lock`.

## Verificação e telemetria

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install chromium
bash scripts/integration.sh
bash scripts/audit.sh
```

Em Linux, pode ser necessário instalar dependências do Chromium com `pnpm exec playwright install --with-deps chromium`. Para usar Chromium já instalado, defina `KM_CHROMIUM_PATH`. A integração cria três projetos próprios descartáveis, valida startup, REST, navegador, fila, RLS, queda de serviços, backup/restore, rollback e entrada inválida. Preserva relatórios Playwright e logs sanitizados em `artifacts/`, `playwright-report/` e `test-results/`.

Com um coletor acessível na rede privada, configure `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` para a URL OTLP HTTP de traces. Sem endpoint, exportação fica inativa e logs estruturados de startup/erro continuam locais. Nunca inclua tokens, consultas privadas ou payloads na telemetria.

O benchmark de readiness usa 100 requests e concorrência 5, reporta p50/p95/p99 e falha em erro HTTP. Execute `node scripts/benchmark.mjs` ou use `KM_BASE_URL` para outra porta. Cronometre backup/restore e compare último registro recuperado com manifesto para linha de base do RNF-03. Benchmarks de recuperação RAG, desempenho de produto e SLOs permanecem nos pacotes previstos.

## Proteção de branch

Em regras de `main`, exigir os checks com nomes `Foundation / verify`, `Foundation / clean smoke` e `Foundation / audit and SBOM` da origem GitHub Actions (usar os nomes exibidos pelo GitHub). Validar em PR de teste que um check ausente ou falho bloqueia merge. A configuração é administrativa no GitHub; todos os jobs rodam em PRs sem credenciais de sandbox. Ver [acompanhamento](../PROGRESS.md) para estado e evidências.
