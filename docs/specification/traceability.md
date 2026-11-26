# Matriz de paridade e rastreabilidade

Cada linha decompõe uma decisão em capacidades V1 ou adiadas, liga a um macro-RF, interface U, contrato C, entidades, pacote responsável e cenário de aceite. O identificador do teste é **T-{ID da decisão}**, com caso positivo e negativo (após “Negar” ou equivalente). Implementações dividem os cenários por capacidade, mantendo o prefixo no CI. As políticas de [autorização](authorization.md), [gates](quality.md), [licenças e exceções](scope-boundaries.md) valem para todas as linhas. U e C apontam aos catálogos de [interface](interfaces.md) e [contratos](contracts.md). As entidades constam no [modelo](data.md). RF-13 a RF-18 são famílias adicionais definidas nos [requisitos](../requirements/functional-requirements.md).

## Docmost

Fonte [decisões DM](../decisions/docmost-scope.md) e [auditoria](../references/docmost-analysis.md). Paridade funcional adaptada ao tenant e à publicação; AGPL/Enterprise só referência.

| Decisão | Capacidades e fase | RF · tela · contrato · entidade · pacote | Teste de aceite e negativo |
| --- | --- | --- | --- |
| DM-01 | V1 espaços com membresia múltipla e identidade corporativa inclusive convidado | 01/02 · U2/U3 · C1/C2 · Membership/Space · 02/03 | Usuário em dois espaços recebe apenas seus grants no web/canal; desconhecido e tenant vizinho recebem negação. |
| DM-02 | V1 árvore multinível, criar/mover/duplicar subárvore, drag/drop, referências, herança e contexto IA | 02 · U3 · C2 · Page/Relation · 03 | Mover atualiza referências e política, duplicar mantém estrutura; rejeitar ciclo e destino não autorizado sem alteração parcial. |
| DM-03 | V1 editor rico, títulos, checklists/listas, tabela/código/imagens/links/Mermaid/callouts, slash, Markdown, autosave e IDs | 03 · U3 · C2 · Draft/Block · 04 | Round-trip da fixture de todos os blocos preserva IDs e conteúdo; sanitizar conteúdo ativo e negar updates após revogação. |
| DM-04 | V1 presença, cursores, sincronização, conflito, reconexão, persistência, IA só publicado | 03 · U3 · C2 · CRDTUpdate/Publication · 04 | Dois clientes editam, reiniciam e convergem; revogar durante WS e confirmar ausência de rascunho no índice. |
| DM-05 | V1 histórico automático, diff, autor/data, restore, retenção e citações versionadas | 03/06 · U3 · C2/C4 · PageVersion · 04/05 | Restaurar cria nova revisão, atualiza índice após publicação e preserva trilha; versão fora da ACL não abre. |
| DM-06 | V1 threads gerais/ancoradas, menções, avisos, resolver/reabrir e histórico | 02 · U3/U7 · C2/C6 · CommentThread · 03 | Mover bloco mantém âncora ou marca órfã; sem aviso a não autorizado nem comentários no índice. |
| DM-07 | V1 busca independente, título/conteúdo, escopo e filtros autor/data/espaço/tag, snippets e ranking textual/semântico | 05 · U5 · C4 · Page/Chunk · 03/06 | Buscar com cada filtro e ordenação; negar snippet/contagem de página invisível. |
| DM-08 | V1 upload múltiplo, preview, download, scan, quota, ACL, storage e indexação de PDF/Office/CSV/TXT/Markdown/imagens OCR; guardar também áudio/vídeo/ZIP; extração destes posterior | 04/06 · U3/U4 · C3 · Attachment · 03/05 | Golden files por formato e purge do índice; rejeitar malware, quota, tenant errado e extração de mídia adiada. |
| DM-09 | V1 import/export Markdown/HTML/Word/PDF/ZIP de espaço e import Confluence/Notion, lote, hierarquia, anexos/imagens/links e progresso; export Confluence/Notion posterior | 04 · U4 · C3 · ImportExportJob · 03/05 | Exportar/importar fixtures com manifestos de perdas e ACL; negar publicação implícita e download por terceiro. |
| DM-10 | V1 usuário/grupo/link interno/convidado, expiração, papéis e auditoria; público anônimo excluído | 01 · U3 · C1/C2 · Grant · 02/03 | Revogar link/grant invalida histórico/cache/IA; token do link sem identidade não lê. |
| DM-11 | V1 rascunho/revisão/publicado/arquivo, aprovação por espaço, responsáveis, vencimento/revisão/avisos e arquivamento | 02/03 · U3/U7 · C2 · ReviewTask/Publication · 04 | Editar mantém versão publicada, vencer retira do índice; editor sem aprovação não publica no espaço restrito. |
| DM-12 | V1 templates versionados por espaço/empresa, campos/seções e permissões | 02 · U3 · C2 · TemplateRevision · 03 | Criar via template, alterar revisão sem alterar documentos antigos; negar template fora do escopo. |
| DM-13 | V1 tags/categorias, campos por espaço, filtros, classificação, responsáveis e sugestão IA confirmada | 02/16 · U3/U9 · C2/C9 · MetadataSchema/Suggestion · 03/13 | Sugestão só aplica após confirmação; classificação e filtros não ampliam ACL. |
| DM-14 | V1 autocomplete, links/backlinks, relações tipadas, links quebrados, grafo e sugestões/exploração IA autorizadas | 02/16 · U3/U9 · C2/C9 · Relation · 03/13 | Grafo e backlinks estáveis após move; excluir marca relação quebrada sem revelar vizinhos ocultos. |
| DM-15 | V1 excluir subárvore/espaço, lixeira 30 dias configurável, restore, purge auditada e retenção | 02/06/15 · U3 · C2/C7 · Tombstone · 03/14 | Restaurar relações, anexos e histórico elegíveis; purge bloqueia IA imediatamente e backup não reexpõe. |

## AnythingLLM

Fonte [decisões AL](../decisions/anythingllm-scope.md) e [auditoria](../references/anythingllm-analysis.md). Adaptação inclui ACL fina e monetização próprias. Sandboxes C3/C5 em G4; kernel Ollama local e fixtures G3. MIT da referência, termos dos provedores à parte.

| Decisão | Capacidades e fase | RF · tela · contrato · entidade · pacote | Teste de aceite e negativo |
| --- | --- | --- | --- |
| AL-01 | V1 Ollama e seis famílias remotas/compatíveis, múltiplos perfis, padrões, overrides, temperatura, tokens, teste, consumo e fallback permitido | 07 · U6 · C5 · ProviderProfile · 06 | Exercitar cada adaptador e validar egress zero em local; falha não aciona fallback não autorizado. |
| AL-02 | V1 perfis embedding independentes locais/remotos, pt/en, consumo/perf, cache e troca atômica pgvector | 06 · U6 · C5 · Embedding/IndexGeneration · 05 | Backfill por perfil e troca com progresso; dimensão divergente não promove e cache não cruza tenant. |
| AL-03 | V1 wiki/uploads, crawler, GitHub/GitLab/Bitbucket, Drive/SharePoint/OneDrive, Confluence/Notion, REST/S3/GCS; agendas/ACL; SQL/e-mail/reuniões posteriores | 04/06 · U4 · C3 · SourceConnection/SourceObject · 05 | Em cada sandbox criar/alterar/excluir item e avançar cursor; ACL desconhecida mantém item não publicado. |
| AL-04 | V1 chunks estruturais, contexto hierárquico, tabelas/listas/código, tamanho/overlap/tipo, ID/hash/dedup e inspeção | 06 · U4 · C3 · Block/Chunk · 05 | Editar um bloco reprocessa só dependências e conserva citações estáveis; alteração de ACL invalida dedup de resultados. |
| AL-05 | V1 híbrido/rerank, metadados, relacionados/adjacentes, limiar, orçamento e autorização pré-busca | 07 · U5 · C4 · Chunk · 06 | Fixture mede recuperação por escopo e orçamento; nenhum chunk sem ACL chega ao reranker. |
| AL-06 | V1 citações inline versionadas, trecho/data/seção, parcial/contradição/abstenção e histórico revalidado | 07 · U5 · C4 · Citation/TurnDependency · 06 | Validar offsets e duas fontes de contradição; descartar ID inventado e remover fonte revogada. |
| AL-07 | V1 web e canais, histórico privado com escopo/origem, streams, cancelar, ramificar, anexar, buscar, favoritos, arquivo, exclusão, Markdown/PDF, share, feedback, seleção e contribuição | 08 · U5/U7 · C4/C6 · Conversation/TurnBranch · 07/09 | Editar preserva ramo original e converter abre rascunho; share/export não entrega fontes inacessíveis nem publica sozinho. |
| AL-08 | V1 hierarquia de instruções, glossário, idioma/tom/detalhe/formato, versão/teste/restore e modo geral rotulado | 07/16 · U6 · C5 · InstructionRevision · 06/13 | Restaurar revisão mantém auditoria; override inferior não desativa citações ou política. |
| AL-09 | Adiada integralmente: agentes/MCP, ferramentas, ações externas, workflows, multiagentes e execução arbitrária | 08 · U5 · C4 · Draft · fora do plano | T-AL-09 verifica ausência de rotas/tools de ação no produto; contribuição confirmada apenas cria rascunho. |
| AL-10 | V1 eventos, webhook/agenda/manual, incremental, versões, revogação, retries, histórico, alertas e reprocesso | 06 · U4 · C3 · SyncRun/JobReceipt · 05 | Duplicar/reordenar eventos e derrubar worker; revisão antiga/excluída nunca ativa. |
| AL-11 | V1 feedback/lacunas, cluster, prioridade, contradição/obsolescência, sugestões e responsável | 16 · U9 · C9 · Feedback/Finding · 13 | Agrupar perguntas sanitizadas e resolver após publicação; falha ACL/índice não vira lacuna automaticamente nem revela chat privado. |
| AL-12 | V1 adoção, tokens/embeddings/storage/latência/custo, orçamento/CSV, preço versionado, fixo + consumo, rateio e visões | 12/14 · U8 · C8 · UsageFact/StatementLine · 12B | Reconciliar recursos reais e exibir projeção comercial; negar custo interno a cliente inclusive export e eliminar dupla cobrança. |
| AL-13 | V1 REST/OpenAPI para consulta, busca, docs/upload/status, webhooks e metering; SDKs/marketplace posteriores | 13 · U2/U4/U5 · C1/C3/C4 · ServiceClient · 02/06 | Token delegado usa interseção, webhook revisável; requisição fora do espaço e credencial revogada falham. |
| AL-14 | V1 cache estrito, batch, concorrência/prioridade, contexto, conexões e economia; aproximado/auto/preditivo posteriores | 06/07/14 · U6 · C4/C5 · TurnDependency/UsageFact · 05/06 | Cache hit sem tokens fictícios; mudança de época/configuração impede hit e sem cruzar tenant. |
| AL-15 | V1 proteção IA, classificação, mascaramento, autorização, egress, logs/limites; DLP/comportamento avançado posteriores | 07 · U6 · C4/C5 · ProviderProfile · 06/14 | Fixture de prompt adversarial e fonte restrita; negar envio ao provedor remoto em qualquer etapa. |
| AL-16 | V1 avaliação comparativa versionada com fonte esperada, revisão humana, limites/custo e promoção; auto/fine-tuning posteriores | 07 · U6 · C5 · EvaluationRun · 06 | Reproduzir recall/citações/abstenção/latência; bloquear promoção sem aprovação e separar dados de produção. |
| AL-17 | V1 corporativo padrão e complemento geral rotulado, proposta revisada; web/search APIs/pesquisa profunda posteriores | 07/08 · U5 · C4 · Turn · 06/07 | Alternar só com configuração e marcar saída; nenhuma pesquisa web nem publicação automática. |
| AL-18 | V1 portabilidade modelo/storage, export completo autorizado, backup/restore, migração e rebuild; multinuvem/self-hosted/multi-vetor posteriores | 15 · U8 · C7/C10 · MigrationRun/BackupManifest · 14 | Migrar e comparar relações/ACL; negar segredos/custo interno e restauração de tombstones. |

## Keycloak

Fonte [decisões KC](../decisions/keycloak-scope.md) e [auditoria](../references/keycloak-analysis.md). Federação nativa, Apache-2.0 como referência; G4 por provedor.

| Decisão | Capacidades e fase | RF · tela · contrato · entidade · pacote | Teste de aceite e negativo |
| --- | --- | --- | --- |
| KC-01 | V1 local, Google/Entra/AWS/Cognito/OIDC/SAML, múltiplos IdPs, exigir SSO, emergência, teste/rotação; LDAP/AD/GitHub/Apple posteriores | 01/09 · U2 · C1 · ExternalIdentity/SessionFamily · 02/08 | Validar emissão/emergência em cada modo, rotation; negar domínio sozinho, issuer/replay inválidos. |
| KC-02 | V1 manual/convites/lote/CSV/JIT, mapeamento, multi-org, convidados, suspensão e autoria; SCIM/LDAP posteriores | 01/09 · U2 · C1 · Invitation/Membership · 02/08 | JIT concorrente cria um membership, atualizar grupos; expiração/suspensão corta acesso e preserva autoria. |
| KC-03 | V1 RBAC/ABAC, grupos/subgrupos, papéis custom, ACL/herança/restrição, grants temporários e inspeção; editor avançado posterior | 01 · U2/U3 · C1/C2 · Role/Grant · 02 | Casos da matriz de papéis, conflito deny e expiração; plataforma/tenant admin não lê sem grant. |
| KC-04 | V1 TOTP, recovery, MFA por escopo, step-up, senha/hash, limites e notificações; passkeys/risco/georrestrição posteriores | 01 · U2 · C1 · MFAFactor/RecoveryCode · 02 | Rotacionar e recuperar com auditoria, bloquear reuso de código e elevação sem step-up. |
| KC-05 | V1 dispositivos e sessões, expiração/limite, access curto/refresh rotativo, revogação e logout; detecção avançada posterior | 01 · U2/U5 · C1 · SessionFamily · 02/08 | Simular reuso e invalidar família, parar stream; logout externo é medido e não propagado por suposição. |
| KC-06 | V1 vínculo próprio/assistido, prova, conflito, desvinculação, migração IdP e histórico; federação KM posterior | 09/10 · U2/U7 · C1/C6 · ExternalIdentity/ChannelLink · 08/09 | Trocar IdP mantendo ID, revogar link; coincidência de email/telefone e desafio replay falham. |
| KC-07 | V1 conta serviço, API key, OAuth2 client credentials, delegação, escopo/rate/medição/rotação; WIF/mTLS posteriores | 13 · U2 · C1 · ServiceClient/Credential · 02 | Serviço não depende de pessoa; token rotacionado, ação sem aprovação e delegação além do escopo falham. |
| KC-08 | V1 auditoria auth/ACL/docs/IA/fontes/serviço/export, CSV/JSON, alertas e retenção; SIEM/avançado posteriores | 12 · U9 · C9 · AuditEvent · 12 | Filtrar e exportar com redação por papel; alteração individual e conteúdo integral ausentes. |
| KC-09 | V1 híbrido, isolamento, provisionamento/branding/domínio, troca org, backup/restauro/migração/encerramento; self-hosted posterior | 15 · U1/U8 · C7 · TenantRegistry/Deployment · 02/14 | Exercitar A/B shared e C dedicado, troca explícita e suspend; plataforma sem acesso ao conteúdo. |
| KC-10 | V1 perfil/privacidade, recuperação, export/excluir, desligamento, órfãos, transferência e anonimização; RH/LGPD avançada posteriores | 01/15 · U2/U9 · C1/C7 · PrivacyRequest/Tombstone · 02/14 | Offboarding preserva publicação, outras orgs e serviço; rascunho vinculado sem abrir chat privado. |

## Unified Channel

Fonte [decisões UC](../decisions/unified-channel-scope.md) e [auditoria](../references/unified-channel-analysis.md). Referência MIT e adaptadores oficiais independentes; Teams legado observado não é a implementação escolhida. G4 obrigatório por canal.

| Decisão | Capacidades e fase | RF · tela · contrato · entidade · pacote | Teste de aceite e negativo |
| --- | --- | --- | --- |
| UC-01 | V1 normalização, threads/mídia, inbox/outbox, dedup, concorrência, retry/status/DLQ; marketplace posterior | 10 · U7 · C6 · InboxEvent/Delivery · 09 | Repetir evento e derrubar após commit; um turno/cobrança lógica, sem ACK antecipado. |
| UC-02 | V1 Teams, WhatsApp, Slack, web com ACL/fontes/anexos/feedback/contribuição; Google Chat/Telegram/Discord/e-mail posteriores | 11 · U7/U5 · C6 · Installation · 07/10/11/11S | Receber/responder com APIs reais e metering; instalação ou usuário incorreto falha. |
| UC-03 | V1 assistência central, múltiplas instalações, ativação, segredo/rotação, teste, status, alertas, nome/avatar/boas-vindas e limites; marketplace posterior | 10/12 · U7 · C6 · Installation/Credential · 09 | Rodar teste e rotação, desativar mantendo histórico; segredo não é exibido e não processa novos eventos. |
| UC-04 | V1 histórico pessoal multi-origem, resumo, retomada confirmada, coletivos autorizados; atendimento/helpdesk posteriores | 08/10 · U5/U7 · C4/C6 · ConversationBinding · 07/09 | Retomar com confirmação e histórico atual; grupo com destinatário desconhecido recebe só orientação privada. |
| UC-05 | V1 vínculo por titularidade e conta corporativa, 30 dias configuráveis, múltiplas orgs, gestão/revogação e step-up | 09/10 · U2/U7 · C6 · ChannelLink · 09 | Provar e renovar, revogar e trocar número; desconhecido/replay não consulta. |
| UC-06 | V1 texto/docs/imagem/OCR/voz→texto/visão, retenção temporária, envio/contribuição confirmada e métricas; síntese/vídeo/chamadas posteriores | 10/11 · U6/U7 · C3/C6 · TemporaryAttachment/UsageFact · 09/10/11/11S | Transcrever, tarifar unidade real e expirar; bloquear anexo malicioso e envio restrito. |
| UC-07 | V1 notificações determinísticas, preferências/resumos, aprovação no canal, críticos/dedup e templates; campanhas/previsão posteriores | 10/16 · U7 · C6 · NotificationPreference · 09/13 | Gerar aviso uma vez e aprovar com identidade; revogar entre fila/envio impede distribuição. |
| UC-08 | V1 observabilidade, etapas, latência/filas, rate/circuit breaker, retry, prioridade e custo, diagnóstico/previsão IA posteriores | 10/14 · U7/U8 · C6/C8 · DeliveryAttempt · 09/12B | Repetir após falha de entrega sem nova inferência; credencial expirada suspende e negação não dispara retry. |
| UC-09 | V1 webhooks/auth/replay, distribuição por classificação, mídia/mascaramento/link seguro, coletivo e retenção; DLP/comportamento avançado posteriores | 10/11 · U7 · C6 · Delivery/AuditEvent · 09/14 | Link reautoriza e usa classe mais restritiva; sem título/preview para destinatário não elegível, inclusive resend. |

## KnowledgeManager

Fonte [decisões KM](../decisions/knowledge-manager-scope.md). Capacidades próprias V1; fornecedores sujeitos a G4.

| Decisão | Capacidades e fase | RF · tela · contrato · entidade · pacote | Teste de aceite e negativo |
| --- | --- | --- | --- |
| KM-01 | V1 console global, lifecycle, planos/catálogo/markup, receita/custo, modo/quotas/flags/versão, equipe e auditoria; CRM/projeção IA posteriores | 14/15 · U8 · C7/C8 · StaffRole/CatalogRevision · 12/12B/14 | Operador provisiona e financeiro vê margem; suporte e tenant não acessam custo interno ou conteúdo alheio. |
| KM-02 | V1 landing/demo/trial, verificação/termos, onboarding/convites/import, adoção, migração/conversão/export; marketplace posterior | 15/18 · U1 · C7 · Trial/Entitlement · 12 | Trial 14d/10/1GB/R$20 sem cartão, conversão explícita preserva ACL; impedir abuso, upload demo e consumo acima do crédito. |
| KM-03 | V1 fixo + uso, catálogo, fechamento/extrato, cartão/Pix/boleto/recorrência, fiscal, estorno, orçamento e atraso; multimoeda/marketplace posteriores | 14 · U8 · C8 · LedgerEntry/BillingPeriod · 12B | Idempotência concorrente e preço histórico; pagamento duplicado/estorno conciliados e atraso não apaga dados. |
| KM-04 | V1 IaC híbrida, escala/pools/leasing, rateio, backups/migração, observabilidade e recomendações; multicloud/self-hosted/preditivo posteriores | 15 · U8 · C7/C10 · Deployment/MigrationRun · 14 | Migrar durante writes, validar ACL, falhar antes da troca e retomar; recomendação arriscada não aplica sozinha. |
| KM-05 | V1 design system, branding, PWA, pt/en, busca/paleta/recentes, temas, responsivo e WCAG; nativos/white label/temas avançados/offline posteriores | 18 · U1–U10 · C1–C10 · TenantRegistry/Membership · 01/12/15 | Playwright teclado/device/temas e auditoria manual; função sem papel não aparece nem é autorizada por request direto. |
| KM-06 | V1 saúde/índice determinístico, lacunas/duplicidades/contradições, glossário, fila/relatórios, editor IA/captura e revisão humana; ontologia/competências posteriores | 16 · U9 · C9 · Finding/GlossaryRevision · 13 | Pesos somam 100%, evidência rastreável e sugestão segue publicação; idade isolada e chat privado não viram achado exposto. |
| KM-07 | V1 ajuda oficial isolada, IA/diagnóstico determinístico, ticket/SLA/incident/status/CSAT e suporte excepcional; chat humano/helpdesk/CRM/agentes posteriores | 17 · U10 · C9 · SupportTicket/SupportGrant · 13S | Ticket percorre espera/reabertura com SLA, revogar grant encerra acesso; diagnóstico sem segredos ou execução arbitrária. |
| KM-08 | V1 Docker/setup/doctor, ambientes, CI/CD, SemVer, migração/backup/rollback, documentação/SBOM/demo; self-hosted comercial/marketplaces/multicloud posteriores | 18 · U10 · C10 · Deployment/RestoreRun · 01/15 | Boot limpo Linux/macOS/WSL2 e update/restore; falha interrompe rollout sem perda de escritas ou teste desabilitado. |

## Decomposição obrigatória por pacote

As linhas acima são o índice de categorias. Antes de implementar, o PR de contrato do pacote publica um inventário revisável comparado com cada subcapacidade do registro normativo. Usar IDs estáveis sob a decisão, por exemplo `DM-04.presenca` e `DM-04.reconexao`. Cada registro contém:

`capabilityId → RF → tela U e ação (ou consumidor sem UI) → operação C e operationId → entidade/política → fixture positiva e fixture negativa → evidência`

| ID de exemplo | RF / UI | Operação / entidade / política | Fixtures previstas |
| --- | --- | --- | --- |
| DM-04.presenca | RF-03 / U3 abrir editor | C2, operação WS de presença / Draft / membro com leitura no espaço e ACL da página | Dois editores veem presença; outro tenant não vê participantes. |
| DM-04.reconexao | RF-03 / U3 reconectar | C2, operação WS de ressincronização / CRDTUpdate / epoch atual | Reaplicar updates após queda; sessão revogada não recebe snapshot nem grava update. |

Os nomes acima são exemplos de planejamento. Na entrega, preencher evidência por commit, ambiente e link da execução, com estado de validação local, sandbox ou produção. Registrar subcapacidades adiadas com disposição e fonte, sem marcá-las como testadas. Conferir itens órfãos, duplicados ou sem fixture e mapear subcapacidades compartilhadas entre pacotes ao responsável e aos consumidores. Usar T-{ID} como agrupador e IDs de fixture por subcapacidade. Aceite do pacote exige cobertura individual do escopo entregue, inclusive quando um teste cobre vários IDs identificados explicitamente.
