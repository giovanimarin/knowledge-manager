# Acompanhamento do projeto

Baseline: PR #4 integrado em 63a0a98d. Escopo integral mantido. Definição funcional 60/60; especificação baseline aceita; implementação 0/18 pacotes aceitos. PKG-01 em execução verificável, com aceite pendente.

## Método
Atualizar em cada PR: pacote, marco, tarefa/subtarefa, estado (pendente, em execução, bloqueado, em validação, concluído), evidência por commit/teste, pendências e próximo passo. Não inferir progresso de código escrito. Concluído exige evidência e aceite aplicável. Percentual do pacote ponderado por marcos e fração de subtarefas verificadas; pesos iniciais PKG-01 22/28/28/22, revisáveis explicitamente. Percentual global de pacotes aceitos separado de esforço ponderado e de prontidão comercial. Gates sandbox/produção pendentes não contam como comprovados. Registrar tempo real quando disponível, sem inventar horas. Manter roadmap e escopo normativo intactos.

## Pacotes
PKG-00 e 00B aceitos documentalmente. PKG-01 em validação; 02,03,04,05,06,07,08,09,10,11,11S,12,12B,13,13S,14,15 pendentes.

## PKG-01 — acompanhamento de implementação

Contratos publicados antes do código. O percentual global continua 0/18 aceitos até revisão e gates obrigatórios. A decomposição e os pesos originais foram mantidos.

### M01 — Estrutura (22%)
- [x] M01.01 Contratos instalação/smoke/readiness/restore — **concluído**. Contrato C10 publicado inicialmente em `b6a7fd2`, reaplicado em `0f4a4de` sobre main. OpenAPI e exemplos aprovados pelo teste local.
- [x] M01.02 Monorepo pnpm — **concluído**. Lockfile congelado instalado em worktree limpo em 10,3 s.
- [x] M01.03 Versões e dependências — **concluído**. Node 24.22.3, pnpm 11.25.0, versões fixas e 308 entradas verificadas da lockfile.
- [x] M01.04 Web — **concluído**. Build React e dois cenários Playwright passaram no Compose.
- [x] M01.05 API — **concluído**. API NestJS respondeu ao smoke via web com contrato 200/503.
- [x] M01.06 Workers — **concluído**. Worker BullMQ gravou um recibo para duas entregas da mesma operação e rejeitou payload inválido.
- [x] M01.07 Módulos/interfaces — **concluído**. Porta de storage e entry point compartilhado verificados no teste de arquitetura.
- [x] M01.08 TS strict — **concluído**. Typecheck estrito passou nos quatro workspaces executáveis/biblioteca.
- [x] M01.09 Lint/format — **concluído**. ESLint e Prettier passaram em `pnpm verify`.
- [x] M01.10 Regras imports — **concluído**. Teste de fronteiras AST passou em `pnpm verify`.

### M02 — Infraestrutura (28%)
- [x] M02.01 Dockerfiles/imagens — **concluído**. Worktree limpo compilou imagens pinadas e extensão pgvector com tarball SHA-256.
- [x] M02.02 Compose — **concluído**. Compose iniciou o projeto limpo e topologias separadas de restore; rede interna e ingress web sem NAT confirmados.
- [x] M02.03 PostgreSQL — **concluído**. PostgreSQL 17.10 saudável, indisponibilidade real e recuperação observadas.
- [x] M02.04 pgvector — **concluído**. Operador vetorial verificado por readiness com o papel de runtime.
- [x] M02.05 Redis — **concluído**. Fila real restaurou processamento após reiniciar e limpar Redis de laboratório.
- [x] M02.06 Storage — **concluído**. Teste de storage passou e bytes/checksums foram confirmados no volume restaurado.
- [x] M02.07 Configuração segura — **concluído**. Segredos gerados localmente, runtime não-root e portas de dados internas. Smoke confirma papéis restritos.
- [x] M02.08 Migrations/papéis — **concluído**. Migração, rollback e reaplicação reais. Fixture RLS A/B, escopo ausente, escrita cruzada e tentativa DDL verificadas.
- [x] M02.09 Health/readiness — **concluído**. HTTP readiness 200 → 503 → 200 na queda do banco, com liveness 200. Redis indisponível também bloqueia readiness.
- [x] M02.10 Comunicação — **concluído**. Smoke via web → API → dependências e worker → fila/DB. Só web exposta em loopback.

### M03 — CI e qualidade (28%)
- [x] M03.01 Actions — **concluído**. Três jobs nomeados no GitHub Actions. [Execução do head 36674ce](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008).
- [ ] M03.02 Checks obrigatórios/permissões — **bloqueado**. A API administrativa retornou 403 e a página administrativa 404 na sessão disponível. Falta ativar/verificar proteção de main.
- [x] M03.03 Build/lint/tipos — **concluído**. Build, lint, format e tipos passaram localmente.
- [x] M03.04 Unit — **concluído**. Cinco testes de Node passaram em 2,195 s, sem skips.
- [x] M03.05 Integração/contratos — **concluído**. OpenAPI/AJV, fila, REST, migrations e RLS sintética verificados. Colaboração/WS de produto segue o plano aprovado.
- [x] M03.06 Arquitetura — **concluído**. Limites entre workspaces verificados pelo teste AST.
- [x] M03.07 Smoke E2E — **concluído**. Dois cenários Playwright em 1,5 s no Actions e 4,6 s no checkout local; API real e apresentação da falha.
- [x] M03.08 Scanners — **concluído**. Auditoria npm sem vulnerabilidades conhecidas. Trivy encontrou 0 achados de segredo e 0 críticos nas quatro imagens revisadas.
- [x] M03.09 Licenças/SBOM — **concluído**. Política npm e inventário de licenças passaram. Cinco SBOMs CycloneDX foram gerados para workspace e quatro imagens.
- [x] M03.10 Relatórios/evidências — **concluído**. Esta trilha registra evidências locais e o resultado por commit. [Workflow e artefatos](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008).

### M04 — Operação (22%)
- [x] M04.01 Setup/start — **concluído**. Setup limpo, subida, smoke e reinício de dependências verificados com Compose real.
- [x] M04.02 Stop/migrations — **concluído**. Stop e up/down/up da migração comprovados no projeto descartável.
- [x] M04.03 Backup consistente — **concluído**. Pausa dos escritores e snapshot DB/storage verificados. Backup com retomada em 10 s.
- [x] M04.04 Restore descartável — **concluído**. Restore em projeto novo, smoke e reabertura em 13 s.
- [x] M04.05 Integridade/checksums — **concluído**. Manifesto, objetos, vínculos, recibos e checksum de migração conferidos após restore.
- [x] M04.06 Falha restore/bloqueio — **concluído**. Backup incompleto recusado e setup posterior manteve a aplicação indisponível.
- [x] M04.07 OTel — **concluído**. Teste recebeu span OTLP HTTP real em servidor local, sem atributos sensíveis.
- [x] M04.08 Benchmark/recuperação — **concluído**. 100 requests concorrência 5: p50 7.13 ms, p95 15.56 ms, p99 49.85 ms. Mesmos registros recuperados no ensaio sintético.
- [x] M04.09 Checkout limpo sem serviços pagos — **concluído**. Worktree sem alterações antes do teste. Serviços locais e fixtures, sem credenciais externas ou APIs pagas.
- [ ] M04.10 Documentação/aceite — **em validação**. Runbook publicado. Aceite formal depende da revisão e da comprovação da proteção obrigatória de main.

## Evidências e impedimentos

Validação ponderada **95%** (M01 10/10, M02 10/10, M03 9/10, M04 9/10). Esse percentual mede subtarefas verificadas. O aceite de pacotes permanece 0/18.

- [PR #5](https://github.com/giovanimarin/knowledge-manager/pull/5) · [contrato C10](packages/PKG-01-contracts.md) · [runbook](packages/PKG-01-runbook.md) · [licenças](licensing/foundation.md).
- Implementação inicial `54960bc`; runtime exercitado no checkout local em `05cf26b`; workflow revisado em `36674ce`. A execução integral de `scripts/integration.sh` no Actions confirmou setup, falhas reais, restore válido e falha fechada. A instalação do lockfile no checkout limpo local levou 10,3 s. Os tempos são medições da rodada. Benchmarks de produto e SLOs permanecem futuros.
- CI registrou a primeira falha de TLS do APT em `fad89d8` e a restrição de leitura do bundle fora do checkout. O fix coloca o bundle público do runner dentro do checkout só para o BuildKit, sem alterar verificação TLS nem incorporá-lo à imagem. [Primeira execução](https://github.com/giovanimarin/knowledge-manager/actions/runs/45906872874) · [execução revisada](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008). [Smoke e relatórios](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008/artifacts/15158302952) · [Auditoria e SBOM](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008/artifacts/15157939053).
- As rodadas locais corrigiram permissões rootless, compatibilidade OTLP, findings nas imagens-base, ligação musl da extensão pgvector e o tratamento de desconexões ociosas do banco. Nenhuma supressão de teste ou aviso crítico foi usada.
- **Bloqueio administrativo:** a CLI recebeu HTTP 403 para o endpoint administrativo e a página de configurações retornou 404 na sessão disponível. Um mantenedor precisa exigir os três checks em `main` e comprovar bloqueio com check ausente ou falho. Esta tarefa não está concluída.
- As 60 decisões e os documentos normativos de produto/arquitetura foram comparados com `main` e permanecem intactos. Nenhum serviço pago foi contratado, e sandboxes e produção seguem os pacotes responsáveis.
