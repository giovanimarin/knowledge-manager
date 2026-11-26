# Desenho do sistema

Proposta de monólito modular. Web, API, colaboração e worker são processos escaláveis da mesma versão, com PostgreSQL como fonte de verdade, Redis para jobs/fanout e armazenamento privado de objetos. Configuração externa, OTel e Compose local. Aplicações de referência ficam fora do runtime.

| Módulo | Responsabilidade | Portas consumidas |
| --- | --- | --- |
| Identidade e acesso | organizações, vínculo, sessão, ACL e decisões | OIDC/SAML, audit |
| Conteúdo | espaços, árvore, anexos e publicação | policy, storage, audit |
| Colaboração | estado CRDT, snapshots e presença | policy, comandos de conteúdo |
| Conhecimento | extração, índice, recuperação e evidência | policy, versões, modelos, storage |
| Conversas | turnos, geração, feedback e histórico | policy, conhecimento, modelos |
| Canais | instalações, inbox, vínculo e entrega | policy, conversas, SDKs |
| Administração | políticas, configurações, limites e auditoria | comandos e projeções públicas |

Cada módulo escreve dados próprios. Casos de uso chamam portas tipadas e adaptadores implementam integração; módulos cruzam fronteiras via comando autorizado na mesma transação quando a invariante requer atomicidade, ou evento após commit. CI veta imports de implementação e escrita fora do dono. Eventos têm versão, identificador, tenant, horário e correlação.

1. Publicação grava versão imutável e outbox na mesma transação. Worker extrai blocos, computa hash canônico, reutiliza embeddings compatíveis e prepara geração completa. Compare-and-swap ativa a geração somente se o documento permanece elegível e a versão ainda é a desejada.
2. Consulta deriva tenant/sujeito da sessão. Busca textual e vetorial consultam somente linhas elegíveis na geração ativa, fundem rankings, reranqueiam e limitam tokens. Antes de enviar contexto e emitir conteúdo, revalidam escopo e dependências. O servidor resolve citações por IDs permitidos.
3. Canal verifica envelope, resolve instalação, grava inbox e ACK após commit. Worker deduplica, resolve vínculo, autoriza e chama conversas. Outbox de entrega mantém status e tentativas. Eventos são processados pelo menos uma vez; consumidores gravam recibo idempotente junto da mutação.
4. Exclusão e revogação tornam o recurso inelegível no registro autoritativo antes de limpar índice, cópias derivadas e objetos. Publicação usa a versão ativa anterior até ativação da nova, exceto em revogação, despublicação, exclusão ou alteração que exija bloqueio imediato. Em falta de backend de política, falhar fechado.

Falha transitória usa backoff exponencial com jitter e teto; erro permanente encaminha para DLQ com motivo e replay auditado. Se o provedor não garantir idempotência e uma entrega ficar ambígua após timeout, registrar estado desconhecido e reconciliar por webhook ou ação autorizada antes de reenvio. Métricas de atraso, saturação e DLQ distinguem backend de provedores.

[Modelo de domínio](domain-model.md) · [Banco](database-design.md) · [Contratos](api-contracts.md).
