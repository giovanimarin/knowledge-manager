# Product specification
Independent unified corporate knowledge platform, one UI, own domain and authorization. Reference projects: https://github.com/docmost/docmost (content), https://github.com/Mintplex-Labs/anything-llm (RAG), https://github.com/keycloak/keycloak (identity), https://github.com/gambletan/unified-channel (channels). No reference application as runtime dependency.
## Scope
- Organization, users, groups, roles, document/space ACLs, tenant isolation from foundation.
- Content: spaces, hierarchical pages, rich editor, collaboration, versions/restore, attachments, comments, tags, import/export, search, publication, governance (owner, confidentiality, review).
- Knowledge: structured extraction, stable block IDs, incremental hash-based chunking/embeddings, hybrid retrieval, reranking, context budget, provider adapters (Ollama and remote), streaming, citations by document/version/section, no-evidence response, feedback, reindex, gaps/contradictions.
- Conversations: web chat, history, authorized context, cancellation, usage.
- Identity: local auth, Google Workspace and Entra OIDC, AWS IAM Identity Center SAML subject to validation, external identity mapping, JIT provisioning, group mapping, session revocation, later SCIM/LDAP where justified.
- Channels: normalized messages, verified webhooks, persistent inbox/outbox, dedup, retry/DLQ, identity linking, routing, delivery tracking; official WhatsApp and Teams first, Slack/Telegram later.
- Admin: organization, users, permissions, model/channel/KB configuration, secrets, indexing health, audit, retention, limits, analytics and usage.
## Proposed architecture (pending audit)
React/TypeScript, NestJS, Tiptap/ProseMirror, Yjs/Hocuspocus, PostgreSQL/pgvector/FTS, Kysely, Redis/BullMQ, local/S3 object storage, Ollama; Python workers only if justified. Modular monolith with separately runnable workers, transactional outbox, versioned contracts, Docker Compose, OTel. Modules own their data; no direct cross-module mutations.
Publication -> outbox -> extraction -> changed blocks -> chunk/embed -> atomic index activation. Query -> authenticated server-derived scope -> authorized hybrid retrieval -> rerank -> context -> model -> verified citations. Revocation and deletion block new retrieval immediately. Channel -> verify -> tenant resolution -> dedup/persist -> identity -> authorize -> conversation -> knowledge -> delivery.
## Acceptance
Cross-tenant negative tests, ACL revocation including historical context, concurrent editing convergence, idempotent indexing and webhooks, no stale deleted sources, verifiable citations, invalid token/webhook rejection, delivery recovery. CI lint/typecheck/unit/integration/architecture/security/E2E and RAG evaluation. LGPD, accessibility, pt-BR/en, backups, audit and observability. No paid API required for tests; mock providers.
## Evidence status
Prior chat audit was partial: Docmost PageService, AnythingLLM streamChatWithWorkspace, Keycloak OIDCIdentityProvider, Unified Channel types and manager were reported inspected; exact commits and findings must be independently verified. No full clone/test audit completed. Stack is provisional.