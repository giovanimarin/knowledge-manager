# Projeto PostgreSQL

Todas as relações de negócio usam `org_id NOT NULL` e chaves/FKs compostas com tenant. Sessão de aplicação sem BYPASSRLS e sem propriedade das tabelas; políticas RLS com escopo transacional (`SET LOCAL` equivalente parametrizado), FORCE RLS e papel de migração separado. Reservar usuário de serviço com escopo por tenant para workers e testes com pooling e contexto ausente.

| Tabelas conceituais | Chaves, índices e transações |
| --- | --- |
| organizations, memberships, groups, group_members, grants, sessions | Unicidade membership por org/usuário; grants por alvo/principal/direito com FKs tipadas. Mutação de grants atualiza epoch de política e outbox juntos. Sessão armazena digest de token opaco, expiração e estado. |
| idp_connections, external_identities, channel_links | Unique org/conexão/issuer/subject e org/instalação/identidade de canal; índice de lookup por sujeito. Consumo de desafio e vínculo em transação. |
| spaces, pages, page_versions, crdt_updates, attachments, version_attachments | FK de pai composta também por espaço. Índice de árvore por espaço/pai/posição. Unique página/número de versão, sequência CRDT e controle de geração para snapshot/compactação. Metadados de objeto, checksum e estado de scan. |
| index_generations, blocks, chunks, embeddings | Unique página/versão/configuração e chunk/posição. GIN para texto, vetores separados por dimensão/modelo quando necessário. Reuso restrito a tenant e configuração. Geração ativa via ponteiro único e lock/CAS no commit. |
| conversations, turns, citations, turn_dependencies, usage_events | Chaves por tenant, índices por conversa/seq e por referência de conteúdo para revogação. Dependência inclui fontes, histórico derivado e anexos; invalidação consultável antes da limpeza. |
| installations, inbox, deliveries, outbox, processed_events, audit_events | Unique `(org_id, installation_id, provider_event_id)`, entrega por operação lógica e recibo por consumidor/evento. Índices parciais por próxima tentativa para linhas pendentes, lease com expiração e reconciliador. |

Objetos privados por tenant com chave randômica; acesso via mediador autorizado, checksum e limpeza idempotente. Tombstone autoritativo ocorre no commit da exclusão. Expurgo assíncrono cobre texto, vetores, cache, anexos e derivados; tombstones orientam restore de backups. Migrações versionadas com expand/contract e teste de upgrade e restauração em cópia sanitizada.

[Fluxos](system-design.md) · [Retenção](security-model.md).
