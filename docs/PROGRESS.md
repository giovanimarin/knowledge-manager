# Acompanhamento do projeto

Baseline: PR #4 integrado em 63a0a98d; PKG-01 integrado via PR #5 em f6fcf69715ebf26a81d4e51961c0c28aecb639e4. Escopo integral mantido. Definição funcional 60/60; especificação baseline aceita; implementação 4/18 pacotes aceitos. PKG-01, PKG-02, PKG-03 e PKG-04 concluídos; PKG-05 é o próximo pacote.

## Método
Atualizar em cada PR: pacote, marco, tarefa/subtarefa, estado (pendente, em execução, bloqueado, em validação, concluído), evidência por commit/teste, pendências e próximo passo. Não inferir progresso de código escrito. Concluído exige evidência e aceite aplicável. Percentual do pacote ponderado por marcos e fração de subtarefas verificadas; pesos iniciais PKG-01 22/28/28/22, revisáveis explicitamente. Percentual global de pacotes aceitos separado de esforço ponderado e de prontidão comercial. Gates sandbox/produção pendentes não contam como comprovados. Registrar tempo real quando disponível, sem inventar horas. Manter roadmap e escopo normativo intactos.

## Pacotes
PKG-00 e 00B aceitos documentalmente. PKG-01 concluído e integrado; PKG-02 concluído e integrado; PKG-03 concluído e integrado; PKG-04 concluído e integrado; PKG-05 autorizado para planejamento e implementação; PKG-06,07,08,09,10,11,11S,12,12B,13,13S,14,15 pendentes.

## PKG-01 — acompanhamento de implementação

Contratos publicados antes do código. O percentual global de pacotes aceitos é 1/18 após revisão e prova dos gates obrigatórios. A decomposição e os pesos originais foram mantidos.

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
- [x] M03.02 Checks obrigatórios/permissões — **concluído**. A API listou os três checks obrigatórios do ruleset Main Protection (28200918) em `main`. O PR descartável #6 teve uma reprovação intencional e dois checks aprovados. O GitHub informou `mergeable_state: blocked` com `mergeable: true` e o PR fora de rascunho. [Evidência da API](https://github.com/giovanimarin/knowledge-manager/actions/runs/45913390185/job/140227491293).
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
- [x] M04.10 Documentação/aceite — **concluído**. Runbook publicado, proteção de `main` comprovada por PR #6, três checks aprovados no head `58bc95c` [execução final](https://github.com/giovanimarin/knowledge-manager/actions/runs/45923608409), revisão final registrada e PR #5 integrado à `main` no commit `f6fcf69715ebf26a81d4e51961c0c28aecb639e4`.

## Evidências e impedimentos

Validação ponderada **100%** (M01 10/10, M02 10/10, M03 10/10, M04 10/10). Esse percentual mede subtarefas verificadas e o aceite formal concluído. Pacotes de implementação aceitos: **1/18 (5,6%)**; não representa percentual de esforço do produto nem prontidão comercial.

- [PR #5](https://github.com/giovanimarin/knowledge-manager/pull/5) · [contrato C10](packages/PKG-01-contracts.md) · [runbook](packages/PKG-01-runbook.md) · [licenças](licensing/foundation.md).
- Implementação inicial `54960bc`; runtime exercitado no checkout local em `05cf26b`; workflow revisado em `36674ce`. A execução integral de `scripts/integration.sh` no Actions confirmou setup, falhas reais, restore válido e falha fechada. No checkout limpo local, a instalação do lockfile levou 10,3 s e o teste integral de Compose terminou com código 0 em 4 min 34,732 s. Nesse ensaio, o backup com retomada levou 30 s, o restore levou 95 s e 100 requests de readiness com concorrência 5 tiveram p50 14,75 ms, p95 78,48 ms e p99 90,89 ms. Essas medições são do ambiente local de teste. Benchmarks de produto e SLOs permanecem futuros.
- CI registrou a primeira falha de TLS do APT em `fad89d8` e a restrição de leitura do bundle fora do checkout. O fix coloca o bundle público do runner dentro do checkout só para o BuildKit, sem alterar verificação TLS nem incorporá-lo à imagem. [Primeira execução](https://github.com/giovanimarin/knowledge-manager/actions/runs/45906872874) · [execução revisada](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008). [Smoke e relatórios](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008/artifacts/15158302952) · [Auditoria e SBOM](https://github.com/giovanimarin/knowledge-manager/actions/runs/45907172008/artifacts/15157939053).
- As rodadas locais corrigiram permissões rootless, compatibilidade OTLP, findings nas imagens-base, ligação musl da extensão pgvector e o tratamento de desconexões ociosas do banco. Nenhuma supressão de teste ou aviso crítico foi usada.
- **Proteção de main comprovada.** O mantenedor ativou Main Protection. No PR de teste #6, head `d623cbc`, os cinco testes de Node passaram antes da etapa deliberadamente reprovada em `Foundation / verify`. `Foundation / clean smoke` e `Foundation / audit and SBOM` passaram. O observador, com permissões somente de leitura, confirmou os três checks obrigatórios do ruleset e o estado `blocked` sem conflito. O PR #6 foi fechado sem merge. [PR de teste](https://github.com/giovanimarin/knowledge-manager/pull/6) · [Checks](https://github.com/giovanimarin/knowledge-manager/actions/runs/45913390185) · [Resposta da API](https://github.com/giovanimarin/knowledge-manager/actions/runs/45913390185/job/140227491293).
- As 60 decisões e os documentos normativos de produto/arquitetura foram comparados com `main` e permanecem intactos. Nenhum serviço pago foi contratado, e sandboxes e produção seguem os pacotes responsáveis.

## Encerramento formal PKG-01

- PR #5 integrado via squash à main no commit `f6fcf69715ebf26a81d4e51961c0c28aecb639e4`. Head de aceite `58bc95cb513f9dd218feca68dcd21511a114aa62`.
- Os três jobs finais passaram na [execução 45923608409](https://github.com/giovanimarin/knowledge-manager/actions/runs/45923608409), com artefatos de smoke e auditoria. Revisão final registrada no PR #5.
- Ruleset `Main Protection` (`28200918`) verificado ativo e exigindo os três checks, branch atualizada, pull request e sem bypass. PR descartável #6 comprovou bloqueio com verify vermelho e `mergeable_state: blocked`, encerrado sem merge.
- Marco M01/M02/M03/M04 e 40/40 subtarefas aceitos. Próximo: PKG-02, com isolamento real shared A/B, dedicated C, sessões/MFA, papéis, RLS e topologias executáveis. Pacotes futuros mantêm seus gates independentes de integração, sandbox e produção.

## PKG-02 — plano inicial

Estimativa de 128–208 h, conforme roadmap. Os pesos totalizam 100%. A fração validada de subtarefas de cada linha pondera o progresso do pacote. A revisão e os gates continuam obrigatórios. Inicialmente nenhuma subtarefa de implementação está comprovada.

| Marco | Peso | Estimativa | Tarefas e subtarefas | Aceite |
| --- | --- | --- | --- | --- |
| I1 Contratos e isolamento | 25% | 32–52 h | I1.1 contratos C1/U2 e negativos; I1.2 migração versionada, papéis e FKs; I1.3 contexto RLS transacional; I1.4 auditoria e revogação duráveis | A/B no mesmo banco e C dedicado. Ausência de contexto nega, escrita transversal falha, auditoria não se altera em runtime. |
| I2 Identidade e sessão | 30% | 38–62 h | I2.1 bootstrap e convites/membership; I2.2 local/Argon2id, limites e recuperação; I2.3 TOTP, códigos e step-up; I2.4 rotação, expiração, logout, revogação | Provar uso único, replay, política de senha, isolamento por organização e troca explícita. |
| I3 Autorização e serviços | 25% | 32–52 h | I3.1 papéis/grupos e administração; I3.2 RBAC/ABAC, herança e grants temporários; I3.3 API keys e client credentials; I3.4 delegação e introspecção | Default deny, deny prioritário, tenant admin sem leitura implícita, delegação por interseção. |
| I4 Topologias e qualidade | 20% | 26–42 h | I4.1 C dedicado e shared A/B; I4.2 escala API/worker com leases e quotas; I4.3 testes HTTP/DB/UI e regressão PKG-01; I4.4 auditorias, runbook e aceite | Evidência de ambientes reais locais, três checks, negativas entre stacks e teste concorrente. |

Federação externa, vínculos de canal, aplicação das ACLs aos dados de cada domínio, console de control plane completo e migração operacional permanecem nas fronteiras aprovadas dos pacotes responsáveis. [Mapa de decisão](specification/traceability.md) · [Contratos PKG-02](packages/PKG-02-contracts.md).


## PKG-02 — execução e evidências

O plano foi registrado no commit `636adc5`, antes da implementação. O [PR #8](https://github.com/giovanimarin/knowledge-manager/pull/8) inclui o commit `cd51164` do PR #7, que foi fechado sem merge. O conteúdo do encerramento formal do PKG-01 foi preservado. Os três checks do PR #7 passaram na [execução 45924055966](https://github.com/giovanimarin/knowledge-manager/actions/runs/45924055966). O aceite do PKG-02 é separado do aceite já registrado do PKG-01.

| Marco | Subtarefas verificadas | Evidência e pendências |
| --- | --- | --- |
| I1 | I1.1–I1.4 | Contratos OpenAPI e Problem Details, RLS/DDL com papel de runtime, FKs compostas, auditoria e revogação. Implementação `f83a8f9`; suspensão de identidade após restauro e rollback independente `1cbb5ec`. |
| I2 | I2.1–I2.4 | Bootstrap, convites, senhas Argon2id, limites, MFA e códigos de recuperação, rotatividade e reuso, revogação ativa e troca de empresa. [Roteiro de operação](packages/PKG-02-runbook.md). |
| I3 | I3.1–I3.4 | Papéis e grupos, herança, negação prioritária, administração sem privilégio implícito de conteúdo, chaves de API e delegação testadas com tokens e banco reais. Reforços `7f2d251`. |
| I4 | I4.1 e I4.3 | Shared A/B e dedicado C, bloqueio entre stacks, regressão de inicialização limpa, falhas do banco e Redis, backup, restore e migrações; instalação dedicada de organização única em `62e9fea` e saída estruturada em `e11db06`. |
| I4 | I4.2 e I4.4 concluídas | `0bf5f46` aplica limites e leases no worker. O Actions comprovou duas réplicas, dois tenants simultâneos, isolamento de quotas, pico global, renovação, expiração, recuperação, retry e nenhum efeito duplicado. Os três checks do commit passaram, incluindo regressão do PKG-01 e isolamento shared/dedicated. Revisão final realizada, PR #8 integrado no commit `bbe7d08f2a05dca3fe5a42fd2d33cdd6747cd7a0`. |

Validação ponderada registrada **100%** (I1 4/4, I2 4/4, I3 4/4, I4 4/4). Pacotes aceitos **2/18 (11,1%)**. A primeira rodada integrada passou pelos três checks em `f83a8f9`. O replay de prova de MFA, o bloqueio após restore e o provisionamento dedicado foram refinados nas rodadas seguintes. [Primeira execução](https://github.com/giovanimarin/knowledge-manager/actions/runs/45925880256) · [Execução do código após os refinamentos](https://github.com/giovanimarin/knowledge-manager/actions/runs/45926503444).

A tentativa de repetir toda a instalação no runner local foi interrompida por falta de espaço no armazenamento Docker. A validação Compose completa segue no GitHub Actions, em instalações descartáveis. Gates de sandbox e rollout continuam vinculados aos pacotes definidos no roadmap.


### Evidência da revisão técnica I4.2 e I4.4

- Duas réplicas processaram A e B simultaneamente. Picos reais de **1** job para A, **2** para B e **3** na stack. A segunda admissão de A ocorreu após **6.981,42 ms**, acima da janela de 6.500 ms. B completou quatro jobs enquanto A ainda aguardava a segunda admissão.
- Lease inicial de 3 s renovado durante job de 4,6 s. Após matar a réplica proprietária, B continuou e A voltou a concluir em **6.946 ms**, medidos da queda até o recibo. O token anterior foi recusado após a retomada. Falha transacional explícita na primeira tentativa, sucesso no retry e zero efeitos duplicados.
- Os três checks obrigatórios passaram no head de implementação `0bf5f46`. No smoke limpo, o Playwright passou 3/3 em 2,0 s, o backup levou 10 s e a restauração 14 s. O teste incluiu regressão de PKG-01 e os negativos multiempresa. A suíte revisada em `3664233` também acrescenta negativo do worker dedicado e teste unitário do contrato. O `pnpm verify` local nessa revisão executou oito testes em 2,189 s, todos aprovados. [Execução do código](https://github.com/giovanimarin/knowledge-manager/actions/runs/45928682541) · [Logs e worker-metrics.json](https://github.com/giovanimarin/knowledge-manager/actions/runs/45928682541/artifacts/15167797503) · [Execução com teste dedicado](https://github.com/giovanimarin/knowledge-manager/actions/runs/45928853423).

## Encerramento formal PKG-02

- PR #8 aceito tecnicamente e integrado à main em `bbe7d08f2a05dca3fe5a42fd2d33cdd6747cd7a0`; head de aceite `460071e64cc95f0a51ad90dcda95862157a43c47`.
- I1–I4 concluídos, 16/16 subtarefas verificadas, 100% no nível do pacote; CI obrigatório 3/3 verde na [execução 45929121586](https://github.com/giovanimarin/knowledge-manager/actions/runs/45929121586), incluindo regressão do PKG-01, shared A/B e dedicated C, concorrência worker/leases e negativos.
- Progresso geral por pacotes aceitos: **2/18 (11,1%)**. Não é percentual de esforço, cobertura total do produto ou prontidão comercial.
- Próximo PKG-03: organizar espaço, árvore, conteúdo, anexos, metadados, comentários, busca textual e segurança da wiki. Planejar marcos/subtarefas e publicar contratos/fixtures antes de implementar; integrar testes de regressão PKG-01/02. Não reabrir nem reduzir o escopo aprovado.

## PKG-03 — plano de implementação

Estimativa de 128–216 h do roadmap. O peso de cada marco é distribuído igualmente entre suas quatro subtarefas. Validação inicial 0/16. Aceite do pacote depende de revisão e dos gates aplicáveis.

| Marco e peso | Estimativa | Subtarefas e critérios verificáveis |
| --- | --- | --- |
| W1 Espaços, acl e árvore · 30% | 38–64 h | W1.1 espaços e participação múltipla com negação padrão; W1.2 documentos e navegação multinível com IDs estáveis; W1.3 mover/duplicar sem ciclos nem mutação parcial e com verificação de origem/destino; W1.4 revogação ativa e isolamento A/B/C, inclusive em resultados derivados. |
| W2 Interação e recuperação de conteúdo · 25% | 32–54 h | W2.1 threads ancoradas/gerais com histórico, resolução e menções autorizadas; W2.2 metadados por espaço, responsáveis, classificação e filtros; W2.3 backlinks, tipos, links quebrados e exploração autorizada; W2.4 busca textual com filtros e sem snippets ou contagens de documentos negados. |
| W3 Arquivos e ciclo de vida · 30% | 38–66 h | W3.1 anexos e limites por empresa com validação, scan, visualização e download autorizado; W3.2 importação/exportação no escopo C3 com fixtures de fidelidade e manifesto de perdas; W3.3 templates com revisões independentes; W3.4 exclusão e restauração da subárvore/espaço, retenção e purga auditada. |
| W4 Experiência e evidência · 15% | 20–32 h | W4.1 interface U3/U4 acessível e sem metadados negados; W4.2 contrato e integração reais com negativos por operação; W4.3 regressão 01/02 e três checks; W4.4 relatório com artefatos e medições G1/G2/G3 aplicáveis. |

[Contratos e fixtures](packages/PKG-03-contracts.md) · [Matriz normativa](specification/traceability.md)

## PKG-03 — execução parcial e evidências

O PR #9 foi integrado em `25d1614` após os três checks do head aprovado passarem. O plano e as fixtures da wiki foram publicados em `d0ecfd3`, antes de `9e53159`. O [PR #10](https://github.com/giovanimarin/knowledge-manager/pull/10) concentra a implementação e suas validações. [Checks do PR #9](https://github.com/giovanimarin/knowledge-manager/actions/runs/45936011199)

| Marco | Subtarefas com aceite comprovado | Evidências e pendências |
| --- | --- | --- |
| W1 | W1.1–W1.3 | Integração de espaços, múltiplos escopos, árvore, negação sem grant, ciclo e duplicação/movimento. W1.4 aguardava a prova C dedicada na rodada de referência. |
| W2 | W2.3–W2.4 | Backlinks, links quebrados e ocultos, busca pt/en e negativos por autorização. Menções autorizadas e configuração de esquema foram acrescentadas posteriormente. Faltam testes de âncora órfã com blocos e evidência de cobertura de todos os filtros. |
| W3 | W3.3 | Template versionado confirmado em REST, com páginas antigas preservadas. Quarentena passou, mas W3.1/W3.2 aguardam scan real, armazenamento privado e conversões/fidelidade. W3.4 tem restauração comprovada; a cobertura de purga e retenção requer a rodada posterior. |
| W4 | W4.3 | Três checks, quatro cenários Playwright, regressões PKG-01/02 e auditoria/SBOM na rodada de referência. A cobertura de U3/U4, contratos e relatório G3 integral permanece aberta. |

Validação ponderada na rodada de referência **46,25%** (W1 3/4, W2 2/4, W3 1/4, W4 1/4). Pacotes aceitos **2/18**. A aprovação técnica do pacote foi concluída no head `6d5c293` e PR #10 integrado em `d11dadf`.

- Head `cf76cd4`: os três checks passaram e quatro cenários Playwright concluíram em **3,3 s**. Busca textual com 15 requisições por cenário: filtrada p50 **15,42 ms** / p95 **24,12 ms**; sem filtro p50 **29,80 ms** / p95 **56,70 ms**. Medições em fixtures Compose do CI. [Execução](https://github.com/giovanimarin/knowledge-manager/actions/runs/45995895935) · [Artefatos de integração](https://github.com/giovanimarin/knowledge-manager/actions/runs/45995895935/artifacts/15196685328)
- O check de smoke da rodada `0c4463f` falhou no cenário negativo da purga porque o login usado ainda tinha step-up da matrícula. O ajuste `e9f4f71` zera a elevação antes da negação esperada e a prepara explicitamente para a purga autorizada. Nenhum teste foi omitido. [Falha da fixture](https://github.com/giovanimarin/knowledge-manager/actions/runs/45996201070)
- [Contrato e roteiro](packages/PKG-03-contracts.md) registram a fronteira do que foi entregue e as lacunas a fechar. Os requisitos aprovados permanecem na matriz normativa.

### Revalidação do código

- Em `cca33a5`, os três checks passaram. O smoke confirmou leitura e escrita negadas entre C dedicado e o conteúdo shared, além de revogação em sessão ativa e isolamento de A/B. W1.4 concluída. O cenário de metadados verificou schema de espaço, edição e busca sob ACL. W2.2 concluída.
- Quatro cenários Playwright passaram em **3,6 s** com as regressões da fundação e identidade. O `pnpm verify` local executou **10 testes** sem falhas nem omissões. O benchmark filtrado mediu p50 **7,99 ms** e p95 **10,82 ms**, e o não filtrado p50 **16,41 ms** e p95 **18,94 ms**, com 15 requisições por cenário.
- Validação ponderada **60%** (W1 4/4, W2 3/4, W3 1/4, W4 1/4). Purga manual e tombstone foram testados; cobertura da retenção automática e reconciliação de backups ainda pendentes. O pacote foi posteriormente concluído e integrado, com **3/18** pacotes aceitos. [Três checks do código](https://github.com/giovanimarin/knowledge-manager/actions/runs/45997296503) · [Artefatos](https://github.com/giovanimarin/knowledge-manager/actions/runs/45997296503/artifacts/15196053824)

### Revisão técnica do PR #10

**Gates locais verificados 16/16 · 100% ponderado.** O aceite do mantenedor e os gates de sandbox permanecem distintos. Pacotes formalmente aceitos **3/18** após revisão e integração do PKG-03.

| Subtarefa | Evidência de conclusão |
| --- | --- |
| W2.1 | `b090083`, `ab12516`, `01dc1e9`. IDs de bloco sobrevivem à reordenação, a remoção deixa a âncora identificável, e o teste cobre histórico, resolução, menções e revogação. O browser exercita a seleção da âncora e o histórico. |
| W3.1 | `b090083`, `6c00cfc`, `5b2474a`. ClamAV **1.5.4** no runner descartável. Falha do daemon mantém quarentena, reanálise libera o arquivo limpo, a assinatura local bloqueia a amostra sintética, e ACL, checksum, quota e replay são exercitados. A v5 move novos bytes para o volume privado e a v6 vincula o upload ao principal. |
| W3.2 | `0064c28`, `fb51d45`, `6be9535`, `5b2474a`. Round trips Word/PDF/ZIP, HTML sanitizado, Markdown, referências e anexos de pacote Notion, pacote Confluence e manifestos de perdas. A fixture local não comprova interoperabilidade com os serviços externos. |
| W3.4 | `a0aaf52`, `6be9535`. Restauração da subárvore e bytes, expiração da janela, auditoria da purga, tombstones e remoção física. Backup e restore passaram, com reconciliação de exclusões definitivas entre snapshots no PKG-14. |
| W4.1/W4.2/W4.4 | `5b2474a`. Cinco cenários Playwright, incluindo U3 e U4 com negativa autenticada em outro espaço. Operações C2/C3 verificadas no contrato, integração e unitários. O relatório G3 registra filtros, busca, scan, ACL, formatos e retenção. |

Em `5b2474a`, os três checks passaram com as regressões 01/02 e isolamento shared/dedicated. O Playwright passou **5/5 em 4,1 s**. Backup em **10 s**, restauração em **15 s**. Com 15 requisições por cenário, busca filtrada p50 **18,06 ms** / p95 **22,80 ms** e sem filtro p50 **48,56 ms** / p95 **55,95 ms**. São medições em fixtures descartáveis. `pnpm verify` local executou 15 testes em **4,99 s**, sem omissões. [Run](https://github.com/giovanimarin/knowledge-manager/actions/runs/46002610298) · [Relatórios, G3 e ClamAV](https://github.com/giovanimarin/knowledge-manager/actions/runs/46002610298/artifacts/15198533115)

Rodadas intermediárias expuseram problemas de licença transitiva, advisories e fixtures U4. O npm foi atualizado, a expressão permissiva MIT + Zlib foi revisada para pako, e o contrato do seletor acessível e a resolução de caminhos de arquivos raiz foram corrigidos. O PDF usa um worker local limitado, sem dependência de binário externo na imagem. [Runbook](packages/PKG-03-runbook.md) · [Contrato e matriz por subcapacidade](packages/PKG-03-contracts.md)

## Encerramento formal PKG-03

- PR #10 revisado tecnicamente e integrado à main no commit `d11dadfb9e0288bacf97b7ab1e2ba1c9e4f0804d`; head aceito `6d5c29340b725ae10784d4503a0df64d9d009e78`.
- W1/W2/W3/W4 **16/16 subtarefas aceitas**, validação do pacote **100%**. [Actions final 46003384359](https://github.com/giovanimarin/knowledge-manager/actions/runs/46003384359): 3/3 checks obrigatórios verdes e artefatos vinculados ao head, 5 Playwright, regressões de PKG-01/PKG-02, shared A/B e dedicated C, ClamAV daemon real com assinatura sintética, isolamento, formatos e retenção.
- Pacotes aceitos **3/18 (16,7%)**. Isso não é medida de esforço completo do produto nem prontidão comercial.
- Limites dos gates posteriores mantidos: integração autenticada real com Confluence/Notion (sandbox/G4), OCR e indexação avançada PKG-05, reconciliação autoritativa de tombstones entre backups PKG-14. A assinatura sintética ClamAV usada no CI não comprova eficácia operacional da base de assinaturas de produção.
- **Próximo PKG-04:** editor rico/blocos e colaboração CRDT/WS real-time, versões/diffs, fluxos de revisão/publicação, ACL/revogação. Planejar marcos, pesos, subtarefas e contratos verificáveis antes de implementar. Regressões PKG-01 a 03 e gates G1/G3 obrigatórios. Escopo total aprovado preservado, sem contratação de serviços pagos.

## PKG-04 — plano de execução

Estimativa de 120–192 h conforme roadmap. Cada marco distribui igualmente o peso entre quatro subtarefas. Baseline 0/16 antes do código.

| Marco e peso | Estimativa | Subtarefas e critérios verificáveis |
| --- | --- | --- |
| E1 Editor e blocos · 25% | 30–48 h | E1.1 validar tipos/IDs de blocos e round-trip; E1.2 formatação, listas/checklists e tabelas; E1.3 links, imagens, Mermaid, código e callouts seguros; E1.4 atalhos Markdown/slash, autosave e UI acessível. |
| E2 Sessão e persistência · 35% | 42–67 h | E2.1 WebSocket autenticado com sync/update/ACK durável; E2.2 CRDT converge com clientes concorrentes, reconexão e reinício; E2.3 presença/cursores efêmeros; E2.4 negar revogação ativa e acessos shared/dedicated antes de leitura ou gravação. |
| E3 Versões e publicação · 30% | 36–58 h | E3.1 histórico com autor/data, diff e retenção; E3.2 restauração como revisão nova; E3.3 revisão de snapshot, responsável, revisores e aprovação conforme política do espaço; E3.4 publicação imutável, validade, arquivamento e evento durável sem expor rascunho. |
| E4 Evidência · 10% | 12–19 h | E4.1 contratos e negativos; E4.2 browser e WS multi-cliente; E4.3 regressões 01–03 e três checks; E4.4 relatório G1/G3 e runbook com limites comprovados. |

[Contratos e fixtures do PKG-04](packages/PKG-04-contracts.md)

### Implementação e evidências do PKG-04

**Validação ponderada local e CI 100%, 16/16 subtarefas.** O PKG-04 foi aceito tecnicamente e integrado via PR #12. Pacotes formalmente aceitos: **4/18 (22,2%)**.

| Marco | Subtarefas | Evidência |
| --- | --- | --- |
| E1 · 25% | E1.1–E1.4 verificadas | Fixtures de 10 tipos de bloco com IDs estáveis e negativos de tipo/URL. Chromium renderizou Mermaid, e duas sessões Playwright exerceram título, checklist, atalhos Markdown, sugestões slash, edição e autosave. `e6cae23`, `a50d409`, `013ee99`. |
| E2 · 35% | E2.1–E2.4 verificadas | Dois usuários WebSocket convergiram em texto concorrente. PostgreSQL guarda snapshot, revisão e recibo antes do ACK. Presença/cursor, replay, reconexão, reinício real da API e revogação com sessão ativa exercitados. A/B shared e C dedicated tiveram negativas. `cdb6a4e`, `97daff3`. |
| E3 · 30% | E3.1–E3.4 verificadas | Histórico, diff, restauração como revisão nova, retenção após 30 dias e preservação da revisão aprovada. Espaço restrito exigiu aprovação, outro ator não aprovou, snapshot publicado permaneceu imutável, e expiração retirada/aviso ficaram registrados no outbox. `cdb6a4e`, `9ceb67e`, `1fe5db5`. |
| E4 · 10% | E4.1–E4.4 verificadas | Contrato JSON e fixtures, 17 testes locais sem omissões, seis cenários Playwright, regressões PKG-01/02/03 e três checks verdes no head de código. Relatório G3 e runbook publicados. |

No commit `65270fc`, os seis cenários Playwright passaram em **7,1 s**. O smoke mediu **41 ms** para confirmar os dois updates, **43 ms** na reconexão, **7 ms** até a negação observada na tentativa após revogação e **3.607 ms** para reiniciar a API e recuperar o documento. Backup em **10 s** e restore em **15 s**. O `pnpm verify` local executou 17 testes em **5,29 s**. As latências são de um ensaio sintético. [Três checks](https://github.com/giovanimarin/knowledge-manager/actions/runs/46044892310) · [Smoke, Playwright e G3](https://github.com/giovanimarin/knowledge-manager/actions/runs/46044892310/artifacts/15221459518)

Rodadas anteriores detectaram importação dupla de Yjs no unitário, licenças transitivas no Mermaid 12 e uma regra de assets que rejeitava pontos em nomes de chunks. O teste usa o mesmo módulo ESM da API, a versão Mermaid 11 evita a dependência ELK e a regra de assets passou em 64 chunks e na renderização real. [Protocolo e fixtures](packages/PKG-04-contracts.md) · [Runbook](packages/PKG-04-runbook.md)

## Encerramento formal PKG-04

- PR #12 revisado tecnicamente e integrado à main em `040fb97acb6a7f724dbddec8b96dfc35d0b48243`; head de aceite `ff4124d090effa11e6cb0dc55162d69cd361a3d5`.
- E1/E2/E3/E4 completos; **16/16 subtarefas, validação ponderada 100%**. [GitHub Actions final 46045510041](https://github.com/giovanimarin/knowledge-manager/actions/runs/46045510041) confirmou os três checks obrigatórios; artefatos smoke e audit no head. O smoke registrou CRDT com dois clientes, replay/ACK idempotente, reconexão 44 ms, revogação 7 ms, reinício+sync 3.532 ms e 6/6 Playwright, com regressões 01–03 e isolamento shared/dedicated. Tempos são de fixture, não SLO.
- Retenção, avisos e vencimentos dependem de agendamento do operador via `scripts/local.sh editor-maintenance`, conforme runbook. Autenticação corporativa real, integrações downstream e escala/hardening de produção permanecem nos pacotes correspondentes.
- **Pacotes de implementação aceitos: 4/18 (22,2%)**; não equivale a percentual de esforço nem prontidão para produção. Próximo: **PKG-05**, ingestão de conhecimento, extração/conversão, filas, deduplicação, embeddings, conectores e seus testes de isolamento/qualidade. Decompor em marcos/subtarefas e publicar contratos/fixtures antes de implementar, preservar escopo completo e zero serviços pagos sem autorização.
