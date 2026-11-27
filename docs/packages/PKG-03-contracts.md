# PKG-03 — contratos C2/C3 e fixtures

As chamadas autenticadas usam a sessão C1. Recursos inexistentes ou invisíveis retornam 404 com Problem Details sem metadados. Escrita sem autoridade retorna 403 ou 404, conflito de hierarquia/revisão retorna 409 e payload inválido retorna 400. Os testes exercitam a mesma identidade após revogação. A autorização é avaliada na operação e no contexto de empresa da sessão. Um UUID nunca é credencial.

| Decisão | Operações e requisitos | Fixture positiva e negativa |
| --- | --- | --- |
| DM-01/02/10 · RF-01/02 | GET/POST /v1/wiki/spaces, GET/POST /v1/wiki/pages, GET/PATCH /v1/wiki/pages/{id}, POST .../{id}/move e .../{id}/duplicate. ACL usa os recursos/grants do C1. | A tem árvore com dois espaços; editor move ou duplica com permissão nos dois lados; negar ciclo, destino sem grant e empresa B. |
| DM-06 · RF-02 | GET/POST .../{id}/comments e PATCH .../{id}/comments/{commentId}, com âncora, thread, menções, histórico e resolução. | Comentário geral e âncora persistente; usuário invisível não recebe evento nem lê thread. |
| DM-07/13 · RF-02/05 | GET /v1/wiki/pages com filtro textual, espaço, tag, autor, datas e ordenação; PATCH página com campos, categorias, tags, responsável e classificação. | Consultar em pt/en; incluir metadados autorizados e omitir título/snippet de documento negado. |
| DM-14 · RF-02 | GET/POST .../{id}/relations e DELETE .../{id}/relations/{relationId}; alvo exige leitura. | Referências com IDs estáveis, backlinks e aresta quebrada; esconder destino sem acesso. |
| DM-08 · RF-04/06 | GET/POST .../{id}/attachments e GET/DELETE .../{id}/attachments/{attachmentId}; payload e tamanho validados e política de scan aplicada antes de servir bytes. | Enviar amostras aprovadas e rejeitar bytes divergentes, excesso de quota, arquivo malicioso e outro tenant. |
| DM-09 · RF-04 | Operações C3 de lote e conversão com manifesto, autorização do ator e rascunhos como saída de importação. | Round-trip e manifesto por formato, sem publicar silenciosamente, sem exportar documento negado. |
| DM-12 · RF-02 | GET/POST /v1/wiki/templates e revisões por POST .../{id}; criação pode selecionar revisão de template. | Novo template não altera páginas existentes e outro espaço não acessa sem grant. |
| DM-15 · RF-02/06/15 | DELETE página ou espaço; lixeira autorizada e POST restore/purge. | Subárvore removida dos resultados e recuperada com anexos; purga terminal, inclusive reconciliação de backups no PKG-14. |

Editor rico, colaboração e publicação seguem PKG-04; extração/conversão avançada e indexação seguem os gates do PKG-05; busca semântica no PKG-06; sugestões assistidas no PKG-13. As fronteiras constam na matriz normativa.

As fixtures sintéticas ficam em [contracts/fixtures/wiki.json](../../contracts/fixtures/wiki.json).
