# ADRs do PKG-00

As decisões são propostas para revisão neste PR. PKG-01 fixa versões suportadas e valida a pilha com smoke tests, SBOM e locks.

| ADR | Alternativas | Decisão e condição de revisão |
| --- | --- | --- |
| ADR-01 | TypeScript/NestJS e Python/FastAPI | NestJS facilita módulos, DI e contratos compartilhados com React. FastAPI oferece ecossistema de extração e ML maior, ao custo de outro runtime e contrato de deployment. Extrair worker Python apenas quando fixtures de extração ou benchmark mostrarem necessidade, com contrato versionado. |
| ADR-02 | Tiptap/ProseMirror + Yjs/Hocuspocus, Lexical + Yjs, OT | Tiptap oferece schema, plugins e serialização ProseMirror. Yjs resolve edição offline e sincronização; Hocuspocus fornece transporte com hooks de autorização. Lexical implica outro formato e migração; OT exige ordenação central e mais trabalho offline. Validar schema, round-trip, persistência antes do ACK e convergência com dois clientes. Extensões comerciais ficam fora da seleção inicial. |
| ADR-03 | PostgreSQL + pgvector/FTS, Qdrant, OpenSearch | pgvector e FTS mantêm filtro de ACL, metadados e troca de geração no mesmo banco. Qdrant oferece índice vetorial especializado; OpenSearch tem busca textual distribuída. Ambos exigem sincronização extra e validação autoritativa de ACL. Medir recall e p95 com filtros seletivos antes de habilitar HNSW. Reavaliar com os alvos do RNF-02. |
| ADR-04 | BullMQ/Redis, fila SQL, RabbitMQ | BullMQ para backoff e execução de jobs, PostgreSQL para outbox/inbox e dedup duráveis. Fila SQL simplifica infraestrutura e merece comparação se Redis ficar restrito. RabbitMQ acrescenta operação e ainda exige outbox. Testar perda total do Redis e reconstrução por outbox/estado durável. |
| ADR-05 | openid-client + biblioteca de sessão/Argon2 e @node-saml/node-saml, Passport como abstração, broker externo | OIDC com openid-client, sessão opaca server-side, Argon2id por biblioteca e SAML condicionado ao spike. Passport pode reduzir plumbing, com validação de comportamento e manutenção por estratégia. Broker externo ampliaria operação e delegaria identidade de execução; o produto mantém controle de sessão, vínculo e autorização. Aceite exige casos negativos de protocolo e revogação. |
| ADR-06 | Kysely vs ORM com relação implícita; S3 vs filesystem | Kysely mantém SQL e transações explícitos para RLS, FTS e vetores. Storage atrás de porta com filesystem local e S3 compatível em produção. Verificar migrações sob conta de runtime e checksum de anexos. |

[Resultados dos testes das referências](../references/verification.md) · [Modelo de segurança](security-model.md).
