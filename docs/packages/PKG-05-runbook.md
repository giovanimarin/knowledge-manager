# PKG-05 — ingestão local

Execute `make setup` para aplicar a v8. A publicação da wiki gera um trabalho PostgreSQL durável. Duas réplicas podem operar sobre a fila, com um processamento por tenant e confirmação transacional. Use os endpoints C3 para consultar os trabalhos e reenfileirar a publicação vigente. Retirada, expiração, lixeira e suspensão tornam a geração inelegível. O worker remove as projeções obsoletas. A leitura também reaplica a ACL da sessão.

Novos trabalhos capturam referências dos anexos limpos no commit de publicação e verificam hash e existência antes de extrair. Arquivos carregados posteriormente exigem nova publicação. Texto, Markdown, CSV, PDF textual, DOCX, XLSX e PPTX têm extratores próprios. OCR de imagens suporta português e inglês com Tesseract local. A mídia aprovada sem extração permanece armazenável. PDF digitalizado e extensões legadas ainda precisam de cobertura específica.

## OCR local

Instale Tesseract e os dados `por` e `eng` fora do contêiner principal, sob um usuário restrito com pacotes atualizados. Configure o processo de OCR em uma unidade local isolada, expondo somente um diretório de socket com grupo apropriado para o worker. O serviço não abre porta TCP.

```bash
node scripts/ingest-ocr.mjs /caminho/privado/ocr.sock
export KM_OCR_DIR=/caminho/privado
export KM_INGEST_OCR_SOCKET=/km-ocr/ocr.sock
make setup
```

Sem socket configurado ou com scanner indisponível, um trabalho que exige OCR falha e entra em retry. O smoke executa Tesseract real com imagem sintética e criptograficamente valida o anexo antes da extração. A imagem principal não inclui o pacote nativo porque a auditoria sinalizou `libxml2` sem versão corrigida no repositório usado no build.

## Vetores e fontes

O perfil padrão calcula vetores lexicais locais de 64 dimensões. O adaptador Ollama opcional aceita `KM_INGEST_EMBED_URL`, `KM_INGEST_EMBED_MODEL` e `KM_INGEST_EMBED_DIMENSION` fornecidos pelo operador para um serviço local. Mudanças de perfil exigem reprocessamento. A suite cobre o contrato de resposta por fixture e persistência de vetor lexical no pgvector. O modelo semântico real e os perfis remotos seguem pendentes.

As fontes são criadas por API com grants explícitos no espaço. Configure `KM_BASE_URL` e um `KM_SOURCE_SESSION` escopado, e use um dos seguintes adaptadores no host ou em agendador local. Credenciais ficam em variáveis do processo e não devem ir para a linha de comando.

```bash
node scripts/ingest-crawler.mjs URL_INICIAL ID_DA_FONTE
node scripts/ingest-git.mjs github ORGANIZACAO/REPO REF ID_DA_FONTE
node scripts/ingest-cloud.mjs drive CONTAINER ID_DA_FONTE
node scripts/ingest-s3.mjs BUCKET ID_DA_FONTE
```

Git aceita GitHub, GitLab e Bitbucket, com `KM_GIT_SOURCE_TOKEN` quando necessário. Cloud aceita Drive, SharePoint, OneDrive, Confluence, Notion e GCS, com `KM_CLOUD_SOURCE_AUTH` e origem explícita no Confluence. S3 usa a cadeia de credenciais do AWS SDK. Por padrão, fontes de rede entram em quarentena, até que a equipe autorize o mapeamento de ACL para o espaço pela variável específica do adaptador.

## Validação

Execute `pnpm verify`, `bash scripts/integration.sh` e `bash scripts/audit.sh`. O host do smoke deve ter ClamAV, Tesseract com português e inglês, Node e Docker Compose. Os providers cloud usam fixtures locais de protocolo. O ensaio G4 com credenciais verificadas permanece separado. [Contrato](PKG-05-contracts.md)
