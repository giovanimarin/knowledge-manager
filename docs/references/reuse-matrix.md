# Matriz de reutilização

As análises registram evidência por commit, risco e cenário de aceite. As quatro aplicações ficam fora das dependências de execução.

| Capacidades | Evidência | Classificação | Requisitos |
| --- | --- | --- | --- |
| Hierarquia, colaboração, histórico, storage e busca | [DM-1 a DM-3](docmost-analysis.md) | Referência funcional | RF-02 a RF-05 |
| Contexto, vetorização, conversa e sincronização | [AL-1 a AL-3](anythingllm-analysis.md) | Referência funcional | RF-06 a RF-08 |
| Broker, JIT, associação e logout | [KC-1 a KC-3](keycloak-analysis.md) | Referência funcional | RF-01, RF-09 |
| Normalização, middleware, Meta e Teams | [UC-1 a UC-3](unified-channel-analysis.md) | Referência funcional | RF-10, RF-11 |
| Pacotes npm de edição, CRDT, autenticação e fila | [ADRs](../architecture/technology-selection.md) | Biblioteca, sujeita a revisão das versões | RF-01, RF-03, RF-06 |
| Política de ACL, proveniência, retenção e inbox/outbox | [Desenho](../architecture/system-design.md) | Independente | RF-01, RF-06, RF-07, RF-10, RF-12 |
| Cópia/adaptação MIT ou Apache | [Licenças](../licensing/license-analysis.md) | Adaptação permitida em princípio após revisão, sem previsão neste plano | — |
| Enterprise Docmost, agentes genéricos, bots não oficiais | [Licenças](../licensing/license-analysis.md) e [escopo](../PRODUCT.md) | Não aplicável | — |

[Requisitos e testes de aceite](../requirements/functional-requirements.md) · [Verificações da auditoria](verification.md).
