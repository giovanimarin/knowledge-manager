# PKG-04 — contrato C2 para edição e publicação

| Rastreabilidade | Operação esperada | Prova positiva e negativa |
| --- | --- | --- |
| DM-03 · RF-03 · U3 | Blocos estáveis: texto, título, lista, checklist, tabela, código, imagem, link, Mermaid e callout. | Round-trip de [blocos](../../contracts/fixtures/editor.json), alterações concorrentes e rejeição de markup, tipo ou URL ativa. |
| DM-04 · RF-03 · U3 | WS `/v1/collaboration/{pageId}`. Primeiro frame auth com bearer. Servidor envia sync com snapshot, sequence e epoch. Update Yjs base64 inclui operationId. ACK somente após commit. Presença e cursor não persistem. | A/B concorrentes, duplicata reapresentada, snapshot após reconexão, ACL reavaliada antes de cada entrada e saída. Credencial revogada não recebe atualização nem grava. |
| DM-05 · RF-03/06 · U3 | GET versões e GET versão/diff sob ACL atual. POST restauração com revisão esperada, que cria uma nova revisão sem reescrever a versão original. | Comparar bloco/título, autor/data preservados, conflito 409, versão revogada 404. |
| DM-11 · RF-02/03 · U3 | Política por espaço, solicitação congelada com responsáveis, decisão por aprovador e publicação. Arquivamento, vencimento e revisão periódica. | Editor sem permissão não publica. Alteração posterior não muda o snapshot aprovado. Rascunho não substitui publicação anterior. Evento sai da mesma transação da publicação. |

Requisições mutáveis do ciclo de vida exigem CAS por revisão. Um update repetido usa o mesmo recibo. O documento tem um tenant e uma árvore efetiva de permissões C1. O canal web não concede autorização adicional. C4/PKG-05 consome eventos de publicação e retirada com os IDs de página e versão. Nenhum rascunho é enviado ao índice.
