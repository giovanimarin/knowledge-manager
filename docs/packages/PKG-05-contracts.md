# PKG-05 — contratos de ingestão C3

| Decisão e RF | Entrada e resultado | Teste obrigatório |
| --- | --- | --- |
| DM-08/09 · RF-04/06 | Extração por formato com origem, checksum e perdas explícitas; consumidor abre somente objetos limpos autorizados. | Arquivo divergente ou em quarentena fica inelegível, mídia sem extrator permanece armazenada. |
| AL-03 · RF-04/06 | Adaptador devolve identidade remota, versão, ACL, upsert/exclusão e próximo cursor; reconciliar antes de avançar cursor. | Repetir página sem duplicatas, negativo ACL desconhecida, alteração incremental e exclusão por conector. Sandbox terceiro distinto de fixture. |
| AL-04 · RF-06 | Segmento registra página, publicação/revisão, bloco, bytes/offset lógico, hierarquia e hash com perfil de vetor. | Reordenar ou editar bloco conserva identidade estável, dedup não cruza tenants e apontadores permanecem distintos. |
| AL-10 · RF-06 | Fila durável consome publicação/retirada e reprocessamento autorizado. Estado/recibo mostra sucesso, falha e próxima tentativa. | Dois workers sem ativação duplicada, retomada após reinício, versão inelegível fica invisível antes da limpeza. |

O worker consulta a publicação imutável e o tenant ativo. A geração torna-se elegível somente se a referência ainda vigente coincide no commit. O acesso do usuário passa por política C1 antes de ler derivados. Fontes sem ACL conhecida ficam em quarentena. A fixture sintética valida processamento local e deve ser distinguida de modelos e serviços externos. [Fixture](../../contracts/fixtures/ingestion.json)

## Operações implementadas e fronteiras

- `GET /v1/ingestion/pages/{id}/chunks` exige ACL atual e geração elegível. Cada registro inclui revisão da publicação, ID do bloco, hierarquia e offsets de pontos de código Unicode na forma normalizada. `GET .../jobs` e `POST .../reprocess` exigem edição. Sem publicação ativa, a leitura devolve lista vazia e o reprocessamento responde 404.
- `POST /v1/ingestion/sources` recebe `spaceId` e `title`. A criação exige governança e gestão de ACL no espaço. `GET .../{id}/objects?after=...` fornece inventário paginado, com cursor da fonte. `POST .../{id}/sync` recebe `id`, `cursor`, `nextCursor` e uma lista de até 50 entradas com `remoteKey`, `version`, `operation` e ACL. Um mesmo recibo com payload alterado ou cursor concorrente retorna 409.
- O valor `mapped-space` exige confirmação explícita por um principal autorizado a administrar as ACLs do espaço. Um item recém-importado é rascunho. A ACL desconhecida fica em quarentena e uma retirada de acesso insere um bloqueio terminal da origem. Restaurar o item revogado pela lixeira falha.
- Os conectores usam inventários limitados, só comparam exclusões depois de uma listagem completa e enviam apenas mudanças. Continuam abertos os sandboxes oficiais, o uso de cursores nativos persistidos entre execuções, webhooks, mapeamento detalhado de ACL e perfis de embedding administrados por empresa.

[Runbook](PKG-05-runbook.md)
