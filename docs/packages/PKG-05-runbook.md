# PKG-05 — ingestão local

Execute `make setup` para aplicar as migrações até a v12. A publicação da wiki gera um trabalho PostgreSQL durável. Duas réplicas podem operar sobre a fila, com um processamento por tenant e confirmação transacional. Use os endpoints C3 para consultar os trabalhos e reenfileirar a publicação vigente. Retirada, expiração, lixeira e suspensão tornam a geração inelegível. O worker remove as projeções obsoletas. A leitura também reaplica a ACL da sessão.

Novos trabalhos capturam referências dos anexos limpos no commit de publicação e verificam hash e existência antes de extrair. Arquivos carregados posteriormente exigem nova publicação. Texto, Markdown, CSV, PDF textual, DOCX, XLSX e PPTX têm extratores próprios. OCR de imagens suporta português e inglês com Tesseract local. Páginas sem camada de texto passam por Poppler e Tesseract (até 12 por PDF). DOC, XLS e PPT passam por conversão local a OOXML antes de extrair texto, células e slides. A mídia aprovada sem extração permanece armazenável. Em PDF misto, o processamento preserva a ordem entre páginas expostas como texto e páginas reconhecidas por OCR.

## OCR local

Instale Tesseract com `por` e `eng`, Poppler, LibreOffice Writer/Calc/Impress e `prlimit` fora do contêiner principal, sob um usuário restrito com pacotes atualizados. Negue a saída de rede e acesso a diretórios alheios na unidade que executa os conversores. Configure o processo de OCR em uma unidade local isolada, expondo somente um diretório de socket com grupo apropriado para o worker. O serviço não abre porta TCP.

```bash
node scripts/ingest-ocr.mjs /caminho/privado/ocr.sock
export KM_OCR_DIR=/caminho/privado
export KM_INGEST_OCR_SOCKET=/km-ocr/ocr.sock
make setup
```

Sem socket configurado ou com scanner indisponível, um trabalho que exige OCR falha e entra em retry. O smoke executa Tesseract real com imagem sintética e criptograficamente valida o anexo antes da extração. A imagem principal não inclui o pacote nativo porque a auditoria sinalizou `libxml2` sem versão corrigida no repositório usado no build.

## Vetores e fontes

A ingestão usa o vetor lexical local de 64 dimensões até a primeira ativação semântica. Em uma sessão de administrador com MFA recente, envie `POST /v1/ingestion/profiles` com `{"model":"bge-m3","dimension":1024}`. O worker preenche lotes no mesmo tenant, aplica novamente a elegibilidade dos segmentos e troca o perfil numa transação após preparar todos os vetores. Erros registram retry e preservam o perfil ativo. A listagem de perfis mostra a versão, o modelo, a dimensão e o estado. Para voltar ao modelo anterior, crie outra versão apontada ao alias anterior autorizado pelo operador.

Inicie o Ollama local com o modelo BGE-M3 e configure uma ponte restrita. O smoke usa CPU com artefato cujo digest é registrado no CI. Mantenha os artefatos do modelo previamente baixados e bloqueie egress no serviço de inferência em operação.

```bash
ollama pull bge-m3
node scripts/ingest-embedding.mjs /caminho/privado/embedding.sock 11434 bge-m3
export KM_OCR_DIR=/caminho/privado
export KM_INGEST_EMBED_SOCKET=/km-ocr/embedding.sock
export KM_INGEST_EMBED_MODEL=bge-m3
export KM_INGEST_EMBED_DIMENSION=1024
make setup
```

Para manter mais de um modelo, use `KM_INGEST_EMBED_CATALOG` com aliases estáveis e registros `{"model":"tag-local","dimension":1024}`. Configure a ponte com os nomes reais separados por vírgula. Preserve a associação entre o alias e o artefato instalado enquanto existir um perfil que use esse alias.

As fontes são criadas por API com grants explícitos no espaço. Configure `KM_BASE_URL` e um `KM_SOURCE_SESSION` escopado, e use um dos seguintes adaptadores no host ou em agendador local. Credenciais ficam em variáveis do processo e não devem ir para a linha de comando.

```bash
node scripts/ingest-crawler.mjs URL_INICIAL ID_DA_FONTE
node scripts/ingest-git.mjs github ORGANIZACAO/REPO REF ID_DA_FONTE
node scripts/ingest-cloud.mjs drive CONTAINER ID_DA_FONTE
node scripts/ingest-s3.mjs BUCKET ID_DA_FONTE
```

Git aceita GitHub, GitLab e Bitbucket, com `KM_GIT_SOURCE_TOKEN` quando necessário. Cloud aceita Drive, SharePoint, OneDrive, Confluence, Notion e GCS, com `KM_CLOUD_SOURCE_AUTH` e origem explícita no Confluence. S3 usa a cadeia de credenciais do AWS SDK. Por padrão, fontes de rede entram em quarentena, até que a equipe autorize o mapeamento de ACL para o espaço pela variável específica do adaptador.

## Validação

Execute `pnpm verify`, `bash scripts/integration.sh` e `bash scripts/audit.sh`. O host do smoke precisa de ClamAV, Tesseract com português e inglês, Poppler, LibreOffice, Node e Docker Compose. O download do modelo público ocorre na preparação do ensaio. O relatório registra tempo, dimensão e similaridade de uma paráfrase bilíngue versus um texto distinto. Os adaptadores cloud usam fixtures locais de protocolo. Os ensaios G4 com autenticação real permanecem separados. [Contrato](PKG-05-contracts.md)

## Conexões gerenciadas

Cadastre um cliente C1 restrito ao espaço, com governança, gestão de ACL e os grants de leitura/edição que o runner precisa para manter rascunhos. Use um administrador com MFA recente para configurar `PUT /v1/ingestion/sources/{id}/connection`. Informe `provider`, `runnerId`, `target`, `credential` e, onde houver mapeamento de pessoas, `principalMapping` com pares `remote` e `member`. Para Git, `target` tem o formato `organização/repositório@ref`. Para AWS, a credencial é um JSON com campos do SDK. A rota de gestão devolve metadados. Somente o cliente C1 vinculado obtém a credencial em execução sob HTTPS ou loopback. Mantenha o token em memória e fora dos logs.

Na rotação, repita a configuração com a nova credencial. O sistema rejeita lotes de gerações anteriores. Na revogação, a credencial cifrada é removida, a leitura dos documentos e seus derivados é bloqueada, e as publicações vinculadas são retiradas. Alterações de principal invalidam as páginas anteriores e exigem nova confirmação da origem.

Para Drive, SharePoint e OneDrive, os adaptadores revalidam as permissões nativas antes de enviar conteúdo e a API intersecta os IDs mapeados com a ACL local. Permissões ambíguas, herdadas ou incompletas deixam o item em quarentena. Os cursores nativos avançam no último commit do lote. Respostas 410 exigem reconciliação completa e validada. Os adaptadores Git aceitam sinais de atualização após validação nativa do webhook. O runner lê sinais antes de consultar a origem e marca os recebidos após aplicar as mudanças.

## Cobertura por provedor

Todos os agentes usam a mesma fronteira C1 e a versão de credencial por conexão. Os cenários de smoke exercitam acesso do agente vinculado, negação a outros agentes e tenants, rotação, rejeição da versão anterior e revogação. O download só ocorre com prova suficiente para o mapeamento local. Revise o artefato de smoke para identificar a rodada e os cenários efetivamente executados.

| Provedor   | ACL de origem e negativa                                                                                                               | Sincronização e recuperação                                                                          | Sinal documentado                                                                    | G4       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| GitHub     | Visibilidade pública ou permissão efetiva de cada `login:id`. ID divergente ou permissão removida põe em quarentena.                   | Snapshot de árvore, checkpoint SHA e comparação de blobs. Árvore truncada bloqueia exclusões.        | HMAC SHA-256 e recibo de entrega.                                                    | Pendente |
| GitLab     | Visibilidade pública ou associação efetiva ativa e não expirada, com papel que permite ler.                                            | Commit fixado e inventário paginado de blobs. Retry e exclusões após snapshot completo.              | Token nativo e chave de idempotência da entrega.                                     | Pendente |
| Bitbucket  | Visibilidade pública ou permissões do repositório com conta e UUID conferidos. Resposta incompleta bloqueia a prova.                   | Commit fixado, comparação de caminhos e inventário completo antes de exclusão.                       | HMAC SHA-256 e UUID da entrega.                                                      | Pendente |
| Drive      | ACL explícita por arquivo, com rejeição de permissões ambíguas.                                                                        | Changes API, checkpoint nativo e tombstones. Reconcile completo para revisão periódica da ACL.       | Canal com token, ID do canal, recurso e número da notificação.                       | Pendente |
| SharePoint | ACL explícita do item. Links, herança e concessões ambíguas seguem para quarentena.                                                    | Graph delta com checkpoint vinculado ao drive, exclusão e recuperação de token expirado.             | Notificação básica do Graph, validação do endpoint, subscription e clientState.      | Pendente |
| OneDrive   | ACL explícita do item. Links, herança e concessões ambíguas seguem para quarentena.                                                    | Graph delta com checkpoint vinculado ao drive, exclusão e recuperação de token expirado.             | Notificação básica do Graph, validação do endpoint, subscription e clientState.      | Pendente |
| Confluence | O endpoint de permissão efetiva deve autorizar a leitura para cada conta mapeada. Negativas e respostas ambíguas põem em quarentena.   | Polling do inventário completo em CQL, versão da página e cursor local.                              | Polling para a conexão REST. Eventos de apps Atlassian não passam por este conector. | Pendente |
| Notion     | A busca e recuperação de página dão acesso à integração. O adaptador põe a página em quarentena quando falta prova por pessoa mapeada. | Polling de busca, paginação e comparação de versão. Exclusões só após inventário completo observado. | HMAC da integração após provisionamento do token de verificação.                     | Pendente |
| S3         | HEAD anônimo confirma acesso público e o mesmo ETag. A política efetiva de objetos privados permanece em quarentena.                   | ListObjectsV2 com comparação por ETag e GET condicional. O cursor durável é local.                   | SNS v2 fixado a tópico e chave confiável. Notificações só despertam a reconciliação. | Pendente |
| GCS        | HEAD anônimo confirma acesso público e a geração esperada. A política efetiva de objetos privados permanece em quarentena.             | Inventário paginado por geração e cursor durável local.                                              | Cloud Storage via Pub/Sub autenticado com OIDC, audiência, conta e assinatura.       | Pendente |

Para polling, agende o comando do provedor com o agente escopado, use uma execução por conexão e chame o mesmo comando após receber um sinal. Nas fontes Drive/Graph, execute também com `KM_CLOUD_FULL_RECONCILE=1` para reavaliar ACL e inventário completos. As listagens Git, Confluence, Notion, S3 e GCS reconciliam apenas após terminar a paginação. Tokens de paginação dessas listagens pertencem à execução corrente. Checkpoints duráveis são o cursor interno e, onde existe, a referência imutável Git ou watermark de delta. Falhas transitórias em leituras HTTP têm três tentativas, e um download que esgota as tentativas deixa o checkpoint anterior para recuperação. Conflito de cursor ou rotação exige iniciar uma nova execução.

Configure `webhookSecret` como segredo simples para GitHub, GitLab, Bitbucket e Notion. Para Drive, use JSON com `token`, `channel` e `resource`. Para Graph, configure `clientState` para validar o endpoint e adicione `subscription` após a inscrição. Para SNS, use `topic`, `certificateUrl` e `publicKey` obtidos por canal confiável. Confirme a inscrição SNS no provedor. Para Pub/Sub, use `audience`, `email`, `subscription` e `keys` públicas confiáveis do Google, com rotação quando as chaves mudarem. Fixtures usam material sintético. Operação autenticada, provisionamento e renovação de inscrições de todos os provedores exigem sandbox G4.

A validação local usa os protocolos acima, sem serviços externos. A cobertura de permissão privada por pessoa no Notion e nos objetos S3/GCS, e a opção de eventos para instalação Atlassian separada, continuam abertas.

[Permissões Bitbucket](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-workspaces/) · [Permissões Confluence](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content-permissions/)
