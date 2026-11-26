# Decisões de produto — Docmost
Aprovadas pelo responsável do produto em 2026-11-26. Todas as 15 funcionalidades entram na primeira versão, com as exceções explícitas abaixo. Referência funcional, não autorização de copiar código AGPL. Não iniciar implementação antes da revisão PKG-00B (#3).

| ID | Escopo aprovado |
|---|---|
| DM-01 | Espaços por empresa, permissões próprias, participação múltipla. Identificar e vincular todo interlocutor à identidade corporativa (incluindo convidados autorizados); web, Teams e WhatsApp usam as permissões do usuário, nunca o canal como autorização. Negar acesso a não identificados. |
| DM-02 | Árvore multinível, criar, mover por drag/drop, duplicar subárvore, mover entre espaços com autorização, herança com restrições adicionais, contexto hierárquico para IA, atualizar referências e permissões. |
| DM-03 | Editor rico: formatação, títulos, listas/checklists, tabelas, código, imagens, links, Mermaid, callouts, menu slash, atalhos Markdown, autosave, IDs persistentes de blocos para indexação incremental e citações. |
| DM-04 | Edição simultânea, presença, cursores, sincronização, conflitos, reconexão, revogação durante sessão, persistência. Yjs/Hocuspocus propostos. IA usa apenas versão publicada. |
| DM-05 | Histórico automático, autores/datas, diff visual, restauração como nova versão, retenção configurável, citações por versão, atualização do índice e rastreabilidade sujeita à autorização. |
| DM-06 | Comentários gerais e ancorados, threads, menções, notificações, resolver/reabrir, histórico e ACL. Comentários e rascunhos não indexados como conhecimento oficial. |
| DM-07 | Busca independente do chat, título/conteúdo, global ou por espaço, filtros autor/data/espaço/tags, snippets, relevância/data, ACL, busca semântica. |
| DM-08 | Upload múltiplo/drag-drop, preview/download, limites por empresa, scan, storage local/object, isolamento, ACL herdada, indexação após publicação e remoção ao excluir. Armazenar PDF, Word, Excel, PowerPoint, CSV, TXT, Markdown, imagens, áudio, vídeo, ZIP. Extrair todos exceto áudio/vídeo/ZIP (extração futura); OCR imagens. Validar fidelidade. |
| DM-09 | Importar/exportar Markdown, HTML, Word, PDF e ZIP de espaço; importar Confluence/Notion (exportação futura). Lote, hierarquia, anexos/imagens/links quando suportados, progresso, erros, ACL, indexação após publicação. |
| DM-10 | Compartilhar com usuários, grupos, links internos, convidados externos identificados; sem links públicos anônimos. Expiração, revogação imediata, auditoria. Leitor, comentarista, editor, administrador com escopo. IA e históricos/caches respeitam revogação. |
| DM-11 | Rascunho, revisão, publicado, arquivado; publicação direta ou aprovação por espaço, responsável/revisores/aprovadores, validade, revisão periódica, notificações, arquivamento manual/automático, indexar publicação, retirar vencidos/arquivados, manter última versão publicada durante edição. |
| DM-12 | Templates personalizados por empresa/espaço, seções/campos predefinidos, permissões e versões; mudanças não alteram documentos existentes. |
| DM-13 | Tags, categorias, metadados personalizados por espaço, confidencialidade, responsáveis, filtros/agrupamento, sugestões IA confirmadas pelo usuário. Metadados ajudam recuperação; confidencialidade nunca amplia ACL. |
| DM-14 | Links internos, autocomplete, backlinks, relações tipadas (dependência/complemento/substituição/referência), links estáveis, detectar quebrados, sugestões IA, visualização gráfica e exploração autorizada pela IA. PostgreSQL inicialmente proposto. |
| DM-15 | Excluir páginas/subárvores/espaços, lixeira por empresa com ACL, restaurar anexos/hierarquia/histórico, retenção configurável padrão 30 dias, purga autorizada ou automática, auditoria, referências quebradas. Bloquear IA imediatamente, purgar conteúdo/anexos/embeddings/caches, revalidar ACL e reindexar publicados ao restaurar. Backups não podem reexpor exclusões definitivas. |

## Próximos passos
PKG-00B deve detalhar contratos, critérios de aceitação, testes negativos multi-tenant, fidelidade de conversões, retenção/backups e licenças. Diferenciar funcionalidades observadas no Docmost de extensões próprias aprovadas. Progresso estimado: 15/60 decisões. Não implica implementação concluída.
