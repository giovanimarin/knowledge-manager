# Requisitos funcionais e aceite

Escopo de [produto](../PRODUCT.md), rastreado na [matriz](../references/reuse-matrix.md). Cenários abaixo são critérios futuros.

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
| RF-09 / 08 | Google Workspace e Entra OIDC; AWS IAM Identity Center SAML condicionado; JIT, mapeamento de grupo e revogação; SCIM/LDAP em fase futura. | Testar issuer, nonce, assinatura e tenant inválidos, ausência de associação automática por e-mail, replay e atualização de grupos em mock; prova corporativa separada. |
| RF-10 / 09 | Normalização, autenticação de webhook, inbox/outbox, dedup, links, roteamento, retries, DLQ e status. | Eventos repetidos geram um turno; falha após commit recupera trabalho; eventos desconhecidos ou vínculos revogados ficam sem acesso. |
| RF-11 / 10–11 | Adaptadores oficiais Meta e Teams; Slack/Telegram posteriores. | Sandbox valida instalação, recebimento, resposta e status/erro do provedor conforme capability; fixture local cobre queda, replay e limites. |
| RF-12 / 12–13 | Administração de tenants, permissões, KB, modelos/canais, segredos, retenção, limites, auditoria, uso/analytics. | Administrador habilitado gira segredo sem ecoar valor, altera limites, vê saúde do índice e exporta auditoria e métricas do próprio tenant. |

## Viabilidade de SSO

| Integração | Viabilidade observada e teste pendente |
| --- | --- |
| Google Workspace | OIDC documentado. Fixar issuer/client, usar `sub` como identificador e validar `hd` conforme configuração corporativa. Validar callback e JIT contra uma organização Workspace de teste. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) |
| Entra ID | OIDC viável com tenant provisionado e issuer esperado, e validação do contexto de `tid`. Começar com configuração por tenant, testar grupos grandes/overage e revogação. [Entra OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) · [Issuer e tenant](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) |
| AWS IAM Identity Center | IdP oferece aplicações SAML 2.0 gerenciadas pelo cliente e exporta metadata. PKG-08 deve validar ACS, entity ID, NameID estável, atribuições, atributos/grupos e rotação de certificado com uma instância real. A configuração depende de administrador e credenciais. [AWS SAML próprio](https://docs.aws.amazon.com/singlesignon/latest/userguide/customermanagedapps-set-up-your-own-app-saml2.html) |

Bibliotecas tratam validação criptográfica. OIDC usa Authorization Code, state, nonce, PKCE, issuer/audience/expiração e JWKS confiável. SAML exige metadata aprovada, assinatura, audience, destination, tempo, correlação com request e consumo único. Vínculos usam identificador estável e política por conexão. [Modelo de segurança](../architecture/security-model.md).
