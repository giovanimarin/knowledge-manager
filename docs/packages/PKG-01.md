# PKG-01 — Fundação do repositório, CI e ambiente local

Pré-requisito: revisão do PKG-00 e ADRs. Estimativa inicial: 40–56 horas de engenharia; inclui documentação e revisão. A fundação entrega esqueleto, infraestrutura e checks que o PKG-02 consumirá.

| Incremento | Entrega | Horas |
| --- | --- | --- |
| 1 | Workspace pnpm com versões travadas, estrutura web/API/worker e portas de módulos. TypeScript estrito, convenções, lint e regra de imports. | 8–12 |
| 2 | Compose local com PostgreSQL/pgvector, Redis e storage local; imagens pinadas; configuração de exemplo sem credenciais reais, health/readiness e migração reversível em banco descartável. | 12–16 |
| 3 | Workflows com permissões mínimas, lockfiles, lint/typecheck/unit/integration/arquitetura, smoke E2E e scanners de dependências/segredos/licenças, SBOM e artefatos. | 12–16 |
| 4 | Runbook de setup, teardown, migração e backup/restore local, OTel básico e protocolo de benchmark. Verificar com checkout limpo. | 8–12 |

## Aceite

- Checkout limpo sobe em Compose por roteiro versionado e confirma readiness API/worker, pgvector, Redis e storage. Parar banco torna readiness indisponível e recuperável.
- CI executa smoke com fixtures locais e verifica schema/migração, papéis distintos para aplicação/migração e teste de isolamento com dados fictícios. Violação de fronteira e lockfile divergente falham no CI.
- SBOM de dependências/imagens é revisável. Registrar versões, licenças e exceções aprovadas antes de incorporar dependências. Segredos de exemplo são inertes.
- Documentar decisões adotadas, testes/resultados, configuração e pendências em PR. Tenant, ACL, editor, embeddings, login e canais entram nos pacotes subsequentes.

[ADRs](../architecture/technology-selection.md) · [Requisitos de qualidade](../requirements/non-functional-requirements.md) · [Roadmap](../ROADMAP.md).
