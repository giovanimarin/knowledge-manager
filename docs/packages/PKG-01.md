# PKG-01 — Fundação do repositório, CI e ambiente local

Pré-requisito: revisão do PKG-00 e ADRs. Estimativa inicial: 40–56 horas de engenharia; inclui documentação e revisão. A fundação entrega esqueleto, infraestrutura e checks que o PKG-02 consumirá.

| Incremento | Entrega | Horas |
| --- | --- | --- |
| 1 | Workspace pnpm com versões travadas, estrutura web/API/worker e portas de módulos. TypeScript estrito, convenções, lint e regra de imports. | 8–12 |
| 2 | Compose local com PostgreSQL/pgvector, Redis e storage local; imagens pinadas; configuração de exemplo sem credenciais reais, health/readiness e migração reversível em banco descartável. | 12–16 |
| 3 | Workflows com permissões mínimas, lockfiles, lint/typecheck/unit/integration/arquitetura, smoke E2E e scanners de dependências/segredos/licenças, SBOM e artefatos. | 12–16 |
| 4 | Runbook de setup, teardown, migração e backup/restore local, OTel básico e protocolo de benchmark. Verificar com checkout limpo. | 8–12 |

## Riscos e estratégia de validação

| Risco | Validação prevista no PKG-01 |
| --- | --- |
| Backup incompleto, inconsistente com o storage ou ilegível | Popular banco e armazenamento local com dados e objetos sintéticos e capturar um conjunto consistente com gravações pausadas. Restaurar em volumes descartáveis usando o runbook. Comparar schema, registros, vínculos e checksums, e confirmar que o smoke volta a passar. Registrar tempos e último dado recuperável como linha de base do RNF-03. Exercitar falha com backup incompleto e confirmar que o ambiente permanece indisponível até recuperação válida. |
| Restore reintroduzir conteúdo excluído ou permissões revogadas | Registrar no runbook o requisito de reaplicar tombstones e conferir ACL antes de reabrir acesso. O PKG-01 exercitará o bloqueio da reabertura no ambiente descartável. A validação de tombstones e ACL com dados reais do domínio fica condicionada à disponibilidade desses fluxos nos pacotes responsáveis. |
| Compose ou smoke depender de credenciais, quotas ou serviços pagos | Executar o smoke com PostgreSQL/pgvector, Redis, storage e provedores simulados locais, a partir de checkout limpo e sem credenciais externas. Após baixar imagens e dependências, bloquear egress externo durante o smoke e registrar o resultado. Documentar os pré-requisitos de bootstrap e quais etapas reais precisarão de sandbox e aprovação de custos nos pacotes correspondentes. |

## Aceite

- Checkout limpo sobe em Compose por roteiro versionado e confirma readiness API/worker, pgvector, Redis e storage. Parar banco torna readiness indisponível e recuperável.
- CI executa smoke com fixtures locais e verifica schema/migração, papéis distintos para aplicação/migração e teste de isolamento com dados fictícios. Violação de fronteira e lockfile divergente falham no CI.
- SBOM de dependências/imagens é revisável. Registrar versões, licenças e exceções aprovadas antes de incorporar dependências. Segredos de exemplo são inertes.
- Documentar decisões adotadas, testes/resultados, configuração e pendências em PR. Tenant, ACL, editor, embeddings, login e canais entram nos pacotes subsequentes.

[ADRs](../architecture/technology-selection.md) · [Requisitos de qualidade](../requirements/non-functional-requirements.md) · [Roadmap](../ROADMAP.md).
