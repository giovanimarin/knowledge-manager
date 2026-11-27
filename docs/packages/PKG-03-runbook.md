# PKG-03 — operação local da wiki

## Inicialização e scanner

Execute `make setup` para aplicar as migrações. O upload é privado e usa `objects/<tenant>/<uuid>` no volume local, com permissões restritas. A API entrega bytes somente após verificar ACL atual, veredito limpo e SHA-256. Não há URL pública de objeto. Migrações v5 e v6 preservam instalações da v4. Anexos legados voltam à quarentena; a reanálise promove bytes do PostgreSQL ao volume privado.

Configure o ClamAV local e um socket Unix no diretório definido por `KM_SCAN_DIR`. O processo Node no contêiner deve conseguir conectar-se a esse socket.

```bash
export KM_SCAN_DIR=/caminho/absoluto/clamav
export KM_CLAMD_SOCKET=/km-scan/clamd.sock
make setup
```

O scanner deve usar assinaturas atualizadas para operação. O smoke instala o daemon no runner descartável e carrega uma assinatura local sintética para demonstrar detecção reproduzível. Se o daemon faltar ou retornar erro, o anexo fica em quarentena e o download retorna 404. Após a recuperação, faça POST no URL autenticado do anexo para reanalisar. Um objeto reprovado só pode ser excluído ou substituído por novo upload.

## Uso e operação

- U3 apresenta a árvore, busca textual, edição de texto, comentários por bloco ou por documento, estados resolvido/reaberto, histórico, anexos e lixeira. O C1 controla os grants de conteúdo. Um administrador de organização precisa de grant de conteúdo explícito. O endpoint de purga exige step-up ativo.
- U4 importa lotes de até 20 arquivos. O limite agregado do navegador é 8 MiB. ZIP de espaço, Confluence e Notion entram como pacote local. Transferências binárias transitam pelo scan antes da conversão. As importações criam rascunhos. Exportações revalidam a ACL de cada página durante a entrega.
- A reserva de upload expira em 15 minutos e pertence ao principal que iniciou a operação. Limites atuais de 8 MiB por arquivo e 50 MiB por empresa. A API valida tamanho, tipo e checksum antes de liberar.
- `bash scripts/local.sh wiki-retention` processa lixeiras expiradas da instalação, registra auditoria e tombstones e remove objetos privados depois do commit. Configure esse comando no agendador local da instalação. O padrão é 30 dias por empresa. A janela pode ser ajustada com `PATCH /v1/wiki/settings`. O backup para os escritores, verifica hashes e reconcilia objetos sem referência. Usuários restaurados continuam suspensos até a reconciliação de identidade; a reconciliação autoritativa de tombstones entre snapshots é PKG-14.

## Repetir os gates

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install chromium
bash scripts/integration.sh
bash scripts/audit.sh
```

A integração requer `clamd` no host Linux do daemon Docker, Node e Compose. Exercita os PKG-01/02, A/B/C, scanner real, revogação, retenção, browser e round trips. `artifacts/wiki-g3.json` mede busca com e sem filtro e lista os cenários de qualidade exercitados. A fixture [de fidelidade](../../contracts/fixtures/wiki-formats/fidelity.json) usa texto em português, HTML ativo descartado e arquivos exportados simulados de Confluence/Notion. O ensaio de sandbox com terceiros segue separado.

[Contratos](PKG-03-contracts.md) · [Acompanhamento](../PROGRESS.md)
