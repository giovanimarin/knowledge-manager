# Modelo de domínio

Baseline da auditoria PKG-00. Aplicar o [detalhamento do PKG-00B](../specification/data.md) para a V1 aprovada.

| Agregado | Fatos e invariantes propostas |
| --- | --- |
| Organização | Membership liga pessoa à organização com estado e funções; grupos contêm memberships desse tenant. A política começa por tenant e estado, exige direito explícito, e restrição de página pode reduzir o acesso do espaço. Admin de operação não ganha leitura automática de documentos. |
| Identidade | Uma conexão configura issuer e política de JIT. Identidade externa única por organização, conexão, issuer e subject. Sessões locais referenciam membership e epoch de revogação. Vínculo de canal é separado de login corporativo e tem ciclo pendente, ativo e revogado. |
| Espaço/Página | Página pertence ao espaço e pode ter pai local. Movimentos evitam ciclos e reavaliam ACL. Governança inclui proprietário, classificação, prazo de revisão e estado rascunho/publicado/arquivado/excluído. |
| Edição/Versão | Rascunho CRDT mutável por sessão autorizada; versão publicada imutável com número monotônico, hash, autor e blocos estáveis. Restaurar cria versão sucessora. Anexo registrado separadamente, liberado após scan e vinculado a versões que o usam. |
| Índice | Geração por página/versão e configuração de embedding, com chunks de blocos identificáveis e offsets. Status pendente, ativa, superada ou cancelada. Citação identifica página, versão, bloco e trecho verificável. |
| Conversa | Sessão de chat por tenant e participante; turno registra execução, cancelamento, uso e dependências do contexto. Remover acesso retira turnos derivados da recuperação e apresentação, inclusive ao reconstruir resumos. |
| Instalação/Mensagem | Instalação autenticada identifica conta no provedor. Inbox receptor, mensagem normalizada e entrega persistem estados e dedup dentro da instalação. |
| Auditoria | Eventos append-only para publicação, acesso administrativo, mudanças de ACL, vínculo, configuração, exportação e exclusão. Identificadores e resultado no log, com conteúdo sensível fora do registro. |

[Integridade e chaves](database-design.md) · [Política de acesso](security-model.md).
