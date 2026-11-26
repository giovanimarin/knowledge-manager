# Contratos propostos

REST JSON sob `/v1`, OpenAPI e clientes gerados. IDs opacos e RFC 9457 para erros, com correlation ID. Validação rejeita campos de autoridade no corpo. Recursos invisíveis retornam 404, sessão inválida 401 e ação proibida em recurso visível 403. Cursor opaco vinculado ao filtro/tenant. Comandos retryable aceitam Idempotency-Key com escopo de tenant, sujeito e rota; payload diferente na mesma chave retorna 409.

| Operação | Contrato e condições |
| --- | --- |
| `POST /sessions`, `DELETE /sessions/current` | Autenticação/local logout. Cookie opaco, CSRF e rotação pós-auth. SSO usa `GET /sso/{connection}/start` e callback dedicado OIDC ou ACS POST SAML. |
| `POST /spaces/{id}/pages`, `PATCH /pages/{id}` | Cria página com pai opcional; alterações de metadados com If-Match, 412 em versão divergente. |
| `POST /pages/{id}/publications`, `POST /pages/{id}/versions/{version}/restore` | Gera versão imutável e outbox, confirmando versão e status de indexação. |
| `WS /collaboration`, `GET /attachments/{id}/content` | Abertura e atualizações passam por ACL e epoch; anexo só sai com scan concluído e elegibilidade atual. |
| `GET /search?q=…`, `GET /pages/{id}/versions/{version}/blocks/{block}` | Retorna somente resultados elegíveis. Resolução de citações exige autorização naquele instante. |
| `POST /conversations/{id}/turns` | Retorna 202 e ID de turno. `GET /turns/{id}/events` oferece SSE com sequência monotônica e eventos delta, citation, completed, cancelled, error. Reconexão verifica ACL, usa Last-Event-ID e pode exigir novo turno se expirado. `DELETE /turns/{id}/generation` cancela idempotentemente. |
| `GET/POST /webhooks/whatsapp/{installation}`, `POST /webhooks/teams/{installation}` | Verificação e autenticação específicas do provedor. ID de rota é candidato e precisa corresponder à conta verificada. ACK após persistência durável, inclusive duplicatas válidas. |
| `POST /channel-links`, `DELETE /channel-links/{id}`, `GET /admin/audit` | Desafios de link expiram, consumo é único e exige confirmação autenticada. Admin auditável, com filtros e dados minimizados. |

Eventos internos `content.published.v1`, `content.revoked.v1`, `access.changed.v1`, `channel.received.v1` e `channel.delivery-requested.v1` carregam eventId, orgId, occurredAt, correlationId e IDs de referência. Nenhum token, texto de documento ou prompt no envelope. Acrescentar campos opcionais de modo compatível ou usar nova versão de contrato. Cobrir verificação de schema e consumidores na CI.

[Fluxo](system-design.md) · [RFs](../requirements/functional-requirements.md).
