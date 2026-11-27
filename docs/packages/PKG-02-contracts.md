# PKG-02 — identidade e isolamento

Contrato C1, U2, RF-01/RF-13/RF-15. Organização explícita no login. Para operações autenticadas, tenant vem de um token válido, com leitura de membership/estado a cada requisição e RLS por transação. Autenticação sem cookie usa Bearer para proteger de CSRF; clientes web mantêm tokens em memória. HTTPS obrigatório fora de localhost. Erros redigidos 400, 401, 403, 404, 409 e 429 com Retry-After conforme a operação. Nenhum segredo aparece em GET, logs ou auditoria. Criação de credenciais retorna segredo somente na emissão.

| Capacidade | Operação C1 | Entidades e teste |
| --- | --- | --- |
| KC-09.tenant | bootstrap local interativo e GET /v1/me | Tenant e membership. Duas orgs na mesma base e instância dedicada. Token de outra instância falha. |
| KC-01.local / KC-05.rotation | POST /v1/sessions, POST /v1/sessions/refresh | Login com organização, e-mail e senha. Retorna desafio MFA ou tokens opacos. Rotação individual, reuso revoga família. |
| KC-05.devices | GET /v1/sessions, DELETE /v1/sessions/:id, DELETE /v1/sessions | Listagem redigida, logout individual e global da organização. |
| KC-04.totp | POST /v1/mfa/enroll, /confirm, /challenge, /step-up | Provisão autenticada, credencial cifrada, TOTP e recovery codes de uso único. Privilégios exigem step-up recente. |
| KC-10.recovery | POST /v1/recovery /v1/recovery/complete | Emissão com prova por canal autorizado, consumo único e revogação de sessões. |
| KC-02.members | GET/POST /v1/members, PATCH /v1/members/:id, POST /v1/invitations/accept | Administração autorizada e auditada, suspensão imediata na organização, identidade estável. |
| KC-03.policy | GET/POST /v1/groups, /roles, /grants; POST /v1/access/check | Escopo e ação, janela de validade, negação prioritária, grupos transitivos. Inspeção limitada a autoridade explícita. |
| KC-07.services | POST/GET /v1/service-clients, DELETE /v1/service-clients/:id, POST /v1/oauth/token | Segredos rotativos, escopos, operação e consumo por integração. Revogação imediata. |
| KC-08.audit | GET /v1/audit-events | trilha append-only, escopo explícito e payload redigido. |

[Contrato verificável](../../contracts/identity.openapi.json). As operações iniciais de infraestrutura e políticas estreitas usam dados sintéticos. A separação shared/dedicated preserva os pacotes de implantação operacional e integração corporativa.
