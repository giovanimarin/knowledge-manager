# Requisitos funcionais e aceite

Escopo de [produto](../PRODUCT.md), rastreado na [matriz](../references/reuse-matrix.md). RF-01 a RF-12 são macro-requisitos do PKG-00, detalhados e ampliados pela [matriz PKG-00B](../specification/traceability.md). Cada pacote responsável detalhará fluxos, regras, casos de erro e testes de aceite, preservando o vínculo com o ID RF. Os cenários abaixo orientam esse detalhamento.

| ID / pacote | Requisito | Aceite |
| --- | --- | --- |
| RF-01 / 02 | Organizações, membros, grupos, funções, autenticação local, sessões e ACL em espaços/páginas. | Duas organizações com identificadores de recurso semelhantes; todas as rotas, busca e objetos respeitam o escopo. Remoção de grupo ou sessão impede próxima operação protegida. |
| RF-02 / 03 | Espaços e árvore; comentários, tags, governança com proprietário, confidencialidade e revisão. | Criar/mover árvore sem ciclos; derivar ACL após mudança; filtrar por tag e listar páginas com revisão vencida para responsáveis autorizados. |
| RF-03 / 04 | Editor rico, colaboração, publicação, histórico e restauração. | Dois clientes convergem após reconexão; restaurar gera nova versão com mesmo conteúdo e autoria atual; leitor não vê rascunho. |
| RF-04 / 03–04 | Importar/exportar conteúdo e anexos; armazenamento e scan. | Round-trip de fixture Markdown/HTML no subconjunto suportado com relatório de perdas; usuário não autorizado não recebe arquivo; exportação respeita ACL a cada item. |
| RF-05 / 03 | Busca textual, filtros por espaço e governança. | Item excluído ou revogado não aparece após commit; usuário sem ACL não vê snippet nem contagens derivadas. |
| RF-06 / 05 | Extração estruturada, IDs estáveis, hash incremental, embeddings e reindexação. | Mudar um bloco não reembebe bloco estável compatível; simular jobs duplicados e fora de ordem, sem promover versão excluída ou antiga. |
| RF-07 / 06 | Busca híbrida, rerank, orçamento, Ollama/remote atrás de portas, citação verificável, recusa e detecção de lacunas/contradições. | Fixture com fontes conflitantes obriga citar versões válidas de ambas ou se abster; modelo simulado nunca inclui fonte de outro tenant; medir qualidade conforme RNF-06. |
| RF-08 / 07 | Chat web, streaming, cancelamento, histórico, feedback e medição de uso. | Cancelar interrompe geração; reconexão revalida; revogar fonte remove contexto derivado de turns e resumos; registrar feedback e uso uma vez. |
| RF-09 / 08 | Google Workspace, Entra, Cognito e OIDC genérico; AWS IAM Identity Center e SAML genérico com gates reais; JIT, mapeamento de grupo e revogação; SCIM/LDAP posteriores. | Testar issuer, nonce, assinatura e tenant inválidos, ausência de associação automática por e-mail, replay e atualização de grupos em mock; prova corporativa separada. |
| RF-10 / 09 | Normalização, autenticação de webhook, inbox/outbox, dedup, links, roteamento, retries, DLQ e status. | Eventos repetidos geram um turno; falha após commit recupera trabalho; eventos desconhecidos ou vínculos revogados ficam sem acesso. |
| RF-11 / 10–11 | Adaptadores oficiais Meta, Teams e Slack em V1; Google Chat, Telegram, Discord e e-mail posteriores. | Sandbox valida instalação, recebimento, resposta e status/erro do provedor conforme capability; fixture local cobre queda, replay e limites. |
| RF-12 / 12–13 | Administração de tenants, permissões, KB, modelos/canais, segredos, retenção, limites, auditoria, uso/analytics. | Administrador habilitado gira segredo sem ecoar valor, altera limites, vê saúde do índice e exporta auditoria e métricas do próprio tenant. |
| RF-13 / 02–06 | API de integração, identidade de serviço e delegação | Contratos e isolamento em T-AL-13/T-KC-07. |
| RF-14 / 12B | Medição, catálogo, orçamento, billing e pagamento/fiscal | Idempotência e visões em T-AL-12/T-KM-03. |
| RF-15 / 02–14 | Controle híbrido, trial, onboarding, portabilidade e privacidade | Isolamento e prova por modo em T-KC-09/T-KM-02/T-KM-04. |
| RF-16 / 13 | Governança, editor assistido, glossário e fila de melhoria | Evidência e revisão humana em T-AL-11/T-KM-06. |
| RF-17 / 13S | Suporte oficial separado, diagnóstico e chamados | Escopo e revogação em T-KM-07. |
| RF-18 / 01–15 | UX/marca, distribuição, atualização e gates | Regressão UI e recuperação em T-KM-05/T-KM-08. |

## Viabilidade de SSO

| Integração | Viabilidade observada e teste pendente |
| --- | --- |
| Google Workspace | OIDC documentado. Fixar issuer/client, usar `sub` como identificador e validar `hd` conforme configuração corporativa. Validar callback e JIT contra uma organização Workspace de teste. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) |
| Entra ID | OIDC viável com tenant provisionado e issuer esperado, e validação do contexto de `tid`. Começar com configuração por tenant, testar grupos grandes/overage e revogação. [Entra OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) · [Issuer e tenant](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) |
| AWS IAM Identity Center | IdP oferece aplicações SAML 2.0 gerenciadas pelo cliente e exporta metadata. PKG-08 deve validar ACS, entity ID, NameID estável, atribuições, atributos/grupos e rotação de certificado com uma instância real. A configuração depende de administrador e credenciais. [AWS SAML próprio](https://docs.aws.amazon.com/singlesignon/latest/userguide/customermanagedapps-set-up-your-own-app-saml2.html) |

Bibliotecas tratam validação criptográfica. OIDC usa Authorization Code, state, nonce, PKCE, issuer/audience/expiração e JWKS confiável. SAML exige metadata aprovada, assinatura, audience, destination, tempo, correlação com request e consumo único. Vínculos usam identificador estável e política por conexão. [Modelo de segurança](../architecture/security-model.md).
