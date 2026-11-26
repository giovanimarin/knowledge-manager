# Acompanhamento do projeto

Baseline: PR #4 integrado em 63a0a98d. Escopo integral mantido. Definição funcional 60/60; especificação baseline aceita; implementação 0/18 pacotes aceitos. PKG-01 autorizado, execução ainda não verificada.

## Método
Atualizar em cada PR: pacote, marco, tarefa/subtarefa, estado (pendente, em execução, bloqueado, em validação, concluído), evidência por commit/teste, pendências e próximo passo. Não inferir progresso de código escrito. Concluído exige evidência e aceite aplicável. Percentual do pacote ponderado por marcos e fração de subtarefas verificadas; pesos iniciais PKG-01 22/28/28/22, revisáveis explicitamente. Percentual global de pacotes aceitos separado de esforço ponderado e de prontidão comercial. Gates sandbox/produção pendentes não contam como comprovados. Registrar tempo real quando disponível, sem inventar horas. Manter roadmap e escopo normativo intactos.

## Pacotes
PKG-00 e 00B aceitos documentalmente. PKG-01 autorizado; 02,03,04,05,06,07,08,09,10,11,11S,12,12B,13,13S,14,15 pendentes.

## PKG-01 — checklist inicial
Todos os itens pendentes de evidência; decomposição de acompanhamento, não mudança de escopo. Contratos antes de implementação.

### M01 — Estrutura (22%)
- [ ] M01.01 Contratos instalação/smoke/readiness/restore
- [ ] M01.02 Monorepo pnpm
- [ ] M01.03 Versões e dependências
- [ ] M01.04 Web
- [ ] M01.05 API
- [ ] M01.06 Workers
- [ ] M01.07 Módulos/interfaces
- [ ] M01.08 TS strict
- [ ] M01.09 Lint/format
- [ ] M01.10 Regras imports

### M02 — Infraestrutura (28%)
- [ ] M02.01 Dockerfiles/imagens
- [ ] M02.02 Compose
- [ ] M02.03 PostgreSQL
- [ ] M02.04 pgvector
- [ ] M02.05 Redis
- [ ] M02.06 Storage
- [ ] M02.07 Configuração segura
- [ ] M02.08 Migrations/papéis
- [ ] M02.09 Health/readiness
- [ ] M02.10 Comunicação

### M03 — CI e qualidade (28%)
- [ ] M03.01 Actions
- [ ] M03.02 Checks obrigatórios/permissões
- [ ] M03.03 Build/lint/tipos
- [ ] M03.04 Unit
- [ ] M03.05 Integração/contratos
- [ ] M03.06 Arquitetura
- [ ] M03.07 Smoke E2E
- [ ] M03.08 Scanners
- [ ] M03.09 Licenças/SBOM
- [ ] M03.10 Relatórios/evidências

### M04 — Operação (22%)
- [ ] M04.01 Setup/start
- [ ] M04.02 Stop/migrations
- [ ] M04.03 Backup consistente
- [ ] M04.04 Restore descartável
- [ ] M04.05 Integridade/checksums
- [ ] M04.06 Falha restore/bloqueio
- [ ] M04.07 OTel
- [ ] M04.08 Benchmark/recuperação
- [ ] M04.09 Checkout limpo sem serviços pagos
- [ ] M04.10 Documentação/aceite

Fonte: docs/packages/PKG-01.md e docs/ROADMAP.md. Atualizar com evidências no PR de cada pacote.
