# KnowledgeManager

Plataforma própria de gestão de conhecimento corporativo: documentos colaborativos, RAG, chat omnichannel e identidade federada.

Fase atual: [PKG-00B — especificação técnica para revisão](docs/packages/PKG-00B.md). Docmost, AnythingLLM, Keycloak e Unified Channel são referências de engenharia, não aplicações integradas. Segurança multi-tenant, autorização antes da recuperação, testes automatizados e validação de licenças são obrigatórios. Nenhum serviço pago sem aprovação.

## Ambiente local

Com Docker Compose v2, Node 24, Bash, curl e Make, execute `make setup` e abra `http://localhost:3000`. Use `make smoke` para verificar os serviços e `make stop` para pausar o ambiente. [Runbook do PKG-01](docs/packages/PKG-01-runbook.md) · [Acompanhamento e evidências](docs/PROGRESS.md).
