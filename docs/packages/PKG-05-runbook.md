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

| Provedor                    | Cobertura implementada para ensaio local                                                                 | G4 autenticado |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| GitHub / GitLab / Bitbucket | Inventário e versão Git, webhook (HMAC GitHub/Bitbucket ou token GitLab), replay e confirmação de sinais | Pendente       |
| Drive                       | Inventário, changes API, ACL explícita e exclusão                                                        | Pendente       |
| SharePoint / OneDrive       | Graph delta, ACL explícita, exclusão e recuperação de cursor                                             | Pendente       |
| Confluence / Notion         | Inventário e leitura de texto, quarentena para política de acesso incerta                                | Pendente       |
| S3 / GCS                    | Inventário paginado, versão do objeto, leitura controlada e reconciliação completa                       | Pendente       |

Continuam abertas a recepção nativa de webhooks fora dos provedores Git, as ACLs nativas específicas de Git, Confluence, Notion e object storage, e os fluxos delta específicos sem implementação. Fixtures e smoke local comprovam somente os fluxos executados no CI.
