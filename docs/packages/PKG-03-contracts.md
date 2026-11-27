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

## Revisão C2/C3

O [contrato verificável](../../contracts/wiki.operations.json) enumera as operações seguras e os códigos negativos. A amostra de [fidelidade](../../contracts/fixtures/wiki-formats/fidelity.json) cobre texto em português, HTML sanitizado, hierarquia e referências locais.

| Subcapacidade | Aceite e evidência esperada |
| --- | --- |
| W2.1 · DM-06 | Identificador de bloco persistente, movimentação sem trocar a âncora, remoção com indicador de órfão, histórico e menções filtradas na leitura e após revogação. |
| W3.1 · DM-08 | Reserva autenticada por página, envio por proprietário com SHA-256 e tamanho vinculados, armazenamento de objetos por tenant, limite, quarentena, ClamAV e download mediado. |
| W3.2 · DM-09 | Markdown, HTML, Word DOCX, PDF textual, ZIP de espaço e importação de pacotes locais Confluence/Notion. ZIP próprio preserva hierarquia, relações selecionadas e anexos limpos. HTML, PDF e Word declaram perdas de apresentação no manifesto. PDF de imagem exige OCR na fronteira PKG-05. Cada saída depende da ACL atual. |
| W3.4 · DM-15 | Restauração dentro da janela com bytes intactos, acesso fechado durante lixeira, purga com step-up ou pelo operador de retenção, remoção física e trilha de auditoria. |
| W4.1/W4.2/W4.4 | Browser U3/U4 com negação real, bloco/preview/importação/exportação, contrato de operação, regressão e relatório G3 com ACL, filtros, latência, formatos e manifestos. |

As conversões preservam conteúdo textual e estruturas explicitadas pelos respectivos adaptadores. Não atribuir ACL de origem desconhecida, estilos complexos, OCR, objetos incorporados ou autenticação com Confluence/Notion a uma fixture local. Os formatos de arquivo da decisão DM-08 permanecem uploadáveis e sujeitos à política de scan. A extração e indexação desses anexos seguem PKG-05 conforme a matriz.

[Roteiro e verificação](PKG-03-runbook.md)
