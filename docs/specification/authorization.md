# Autorização e segurança

## Avaliação

Em cada operação, resolver sessão/credencial e tenant ativo no servidor, verificar estado da organização, credencial, membership e recursos, aplicar RBAC e escopo do grant, e depois restrições ABAC. Toda condição deve permanecer verdadeira: prazo, grupo transitivo no tenant (sem ciclos), papel, ação, ACL ancestral, ACL explícita, classificação, versão, canal/destinatário, propósito e step-up. Restrições e negativas prevalecem, ausência de concessão nega. Metadado de confidencialidade restringe distribuição/processamento e jamais amplia ACL. Inspeção de acesso efetivo retorna motivos redigidos e exige autoridade administrativa sobre alvo e principal.

| Papel no escopo | Ler/IA | Comentar | Editar | Aprovar/publicar | Administrar |
| --- | --- | --- | --- | --- | --- |
| Leitor, inclusive convidado com grant válido | publicado autorizado | — | — | — | — |
| Comentarista | leitor | sim | — | — | — |
| Editor | leitura autorizada, incluindo rascunho de trabalho | sim | sim | publicação direta só se autorizada pela política do espaço | — |
| Aprovador | leitura necessária para revisão | sim | só com papel adicional | aprova no fluxo configurado | — |
| Admin de espaço | conforme grants | conforme grants | conforme grants | configura fluxo | ACL e configuração do espaço, somente direitos que pode delegar |
| Gestor de conhecimento | apenas conteúdo autorizado | conforme grants | propostas conforme escopo | conforme grants | métricas e fila de melhorias do escopo |
| Admin de tenant | conforme grants explícitos | conforme grants | conforme grants | conforme grants | membros, grupos, domínios, políticas e configurações |
| Financeiro tenant | — | — | — | — | consumo comercial, orçamento, faturas |
| Auditor tenant | — | — | — | — | leitura/exportação de auditoria autorizada, sem payload privado |
| Plataforma: superadmin, financeiro, infra, suporte, auditor | sem acesso automático | — | — | — | operações de control plane por papel; custo/markup/margem somente papéis financeiros autorizados |
| Serviço/delegado | interseção de escopos e política atual | idem | idem | sujeito a aprovação | sem autoridade implícita |

Usuário vê seus próprios eventos auditáveis. Link interno é referência autenticada. Convidado é uma identidade com membership e grant expirável, nunca um bearer público. Conteúdo compartilhado em conversa é projeção autorizada a cada leitura inclusive para destinatário. Revogar membership, vínculo, credencial ou ACL atualiza epoch no commit, interrompe novos acessos, jobs sensíveis e stream no próximo checkpoint observado. Controle obrigatoriamente cobre armazenamento, WS, anexos, caches, citações, exportações e respostas e históricos derivados.

## Federação, sessões e distribuição

Chave externa por tenant/conexão/issuer/subject, e vínculo externo por instalação/conta verificada. Login local usa e-mail e Argon2id, recuperação com desafio expirável de uso único; TOTP e códigos de recuperação com proteção contra repetição. MFA obrigatório em privilégios e step-up para IdP, política, elevação, segredos, exportação integral e exclusão definitiva. MFA externo requer contexto comprovado pela conexão; aplicar etapa local caso contrário. Limitar tentativas por conta e origem, sem permitir bloqueio permanente por terceiros. Sessão separada por organização, token curto, renovação rotativa com revogação da família por reuso, expiradores de inatividade/absoluto, limite de sessões configurável. Invalidar todos os canais no desligamento local, preservar outras organizações e serviços independentes. Logout e desligamento externos têm latência dependente de sinais disponíveis. A engenharia propõe revalidar no login/refresh, receber eventos confiáveis quando disponíveis, fornecer revogação administrativa imediata e medir janela por IdP em sandbox antes da liberação.

Link de canal exige desafio único expirável, prova da conta e sessão corporativa explícita. Prazo padrão do vínculo de 30 dias, configurável. Continuidade entre canais pede confirmação por padrão. Mudança de conta/fone refaz vínculo. Grupos só recebem conteúdo se todos destinatários forem determináveis e autorizados no despacho. Caso contrário, redirecionamento genérico ao privado sem títulos, citações ou previews. Separar identidade do contexto privado/coletivo e verificar novamente nas entregas pendentes.

Para IA, perfil público/interno admite provedores autorizados, confidencial restringe a provedores específicos ou local, restrito é local ou indisponível. Aplicar a geração, embeddings, OCR, visão, rerank, transcrição e anexos. Saída deriva classificação mais restritiva. Política de distribuição permite conteúdo, link autenticado ou bloqueio por canal/classe. Mascaramento é complementar. Dados recuperados são entrada não confiável delimitada, sem ferramentas externas, credenciais, instruções privilegiadas ou egress arbitrário. Se escopo mudar, invalidar dependências e cancelar geração antes de continuar a entrega. Bytes já entregues externamente podem persistir.

Acesso excepcional de suporte é consentimento explícito, com propósito, recurso, duração, autoridade do concedente e revogação. Step-up e auditoria de concessão e uso. Diagnóstico em backend por operações predefinidas e sanitizadas. Auditoria append-only registra tenant, ator, canal, ação, recurso, resultado, motivo, timestamp, correlação e mudanças redigidas; inclui leituras do próprio log. Exportar CSV/JSON com escopo, expiração por política, alertas críticos e nenhuma edição individual por usuário comum.
