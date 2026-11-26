# Modelo de segurança e privacidade

Baseline da auditoria PKG-00. Aplicar o [detalhamento do PKG-00B](../specification/authorization.md) para a V1 aprovada.

| Risco | Controle proposto e condição de teste |
| --- | --- |
| Acesso entre organizações | Tenant derivado da identidade ou instalação verificada. Política central por ação/alvo e RLS complementar. Exercitar rotas, WS, buscas, citações, histórico, cache e objetos com identidade de outra organização. |
| Revogação concorrente | Mudança de ACL ou sessão incrementa epoch na transação. Revalidar antes de recuperar, despachar contexto ao provedor, liberar lote do stream e abrir cada citação/anexo. Se o epoch muda, interromper a geração e descartar dependências inválidas. Cache inclui tenant/sujeito/epoch/geração; pub/sub acelera desconexão. Bytes já recebidos não são recuperáveis, e fornecedores externos exigem política de retenção aprovada. |
| Prompt injection e vazamento via modelo | Documentos, mensagens e resultados são dados não confiáveis delimitados no contexto. Prompt sem segredos, ferramentas desabilitadas no MVP, egress restrito e provedor configurado por tenant. Resolver IDs citados no servidor e limitar conteúdo de saídas e logs. Avaliar com fixtures sintéticas, incluindo instruções contraditórias, solicitação de dados não autorizados e citações inventadas. |
| Corrida de versões e exclusão | Jobs têm version/config fingerprint. Ativação compara estado atual; exclusão/despublicação bloqueia no commit e agenda limpeza. Restore grava nova versão. Testar cancelamento, outbox atrasada e versões processadas fora de ordem. |
| Confusão de identidade | Login e link vinculados a tenant, conexão, nonce, sessão e desafio de uso único. Reautenticar para link sensível e auditar. Falta de vínculo impede acesso a base interna. Contexto coletivo só é elegível quando a API oficial permite verificar todos os destinatários e sua autorização atual. Caso contrário orientar conversa privada. |
| Entrada e anexos | Validar envelopes, limites de corpo, tipo real, scan e armazenamento privado. Downloads remotos por destinos permitidos, sem redirecionamento livre. Credenciais em secret manager ou arquivo local ignorado. Logs sem tokens ou payload integral. |
| Retenção e direitos LGPD | Inventariar dados, aprovar finalidade e prazos por classe, registrar solicitações de exportação/exclusão e auditar exceções. Backup criptografado, expiração e reaplicação de tombstones antes de liberar restore. Segregar acesso a telemetria e suportar retração do vínculo. |

CSRF em requests de cookie, cookies HttpOnly/Secure/SameSite, limites por tenant/sujeito/instalação e TLS. Dependências de autenticação verificadas, sem implementação própria de primitivas criptográficas. Alvos operacionais e avaliação em [RNFs](../requirements/non-functional-requirements.md).
