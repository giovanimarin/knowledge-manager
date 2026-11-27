# PKG-02 — operação local de identidade

## Instalação e acesso

Execute primeiro o [setup da fundação](PKG-01-runbook.md). Uma instalação existente na v1 recebe a v2 por `make setup`; os checksums e fixtures da v1 são preservados. Crie uma organização e o administrador inicial em terminal autorizado com acesso ao daemon local.

```bash
make setup
bash scripts/local.sh bootstrap "Empresa local" admin@example.invalid "Admin local"
```

Informe a senha de pelo menos 12 caracteres quando solicitado. A saída contém os IDs da organização e do administrador. Abra `http://localhost:3000` e entre com o ID da organização, e-mail e senha. Cadastre o URI no autenticador TOTP e confirme. Proteja os códigos de recuperação exibidos na primeira confirmação. Login com MFA já ativado pede um novo código ou um código de recuperação ainda não usado.

O navegador mantém os tokens em memória. O token de acesso dura 10 minutos. A família tem expiração absoluta de 24 horas e inatividade de 30 minutos. A UI permite sair para trocar explicitamente de organização. Integrações usam a operação de refresh do [C1](../../contracts/identity.openapi.json), que gira os dois tokens e revoga a família se um refresh anterior for reapresentado. As alterações de política são consultadas em cada operação.

A administração pode criar convites individuais e em lote por C1. CSV aceita cabeçalho `email,name` e opcional `guestUntil` em ISO 8601, até 50 entradas por lote. A prova expira em 24 horas e deve ser entregue por canal verificado pelo operador. A recuperação administrativa de membro não privilegiado emite uma prova de 15 minutos após step-up. A entrega pelo IdP ou canal transacional pertence à integração responsável. API keys retornam o segredo somente na criação e rotação. Troque por credencial curta em `/v1/oauth/token` com `grant_type=client_credentials` por JSON. A administração e a delegação ficam limitadas às permissões efetivas e ao tenant atual.

## Topologias e recuperação

Use nomes de projeto e arquivos `.env` distintos para o shared e o dedicado. Para o dedicado, selecione projeto, arquivo `.env` e porta local diferentes. Exporte `KM_DEPLOYMENT_MODE=dedicated` ao executar o bootstrap. O banco fixa o modo e recusa outra organização naquele deployment. O Compose cria bancos, filas, storage, processos e redes separados. Use a mesma stack shared para duas empresas e inicialize cada empresa por bootstrap. O teste valida ambas no mesmo banco, um terceiro tenant dedicado, negação bidirecional e duas réplicas de API e worker compartilhadas. Consulte o log do teste para resultados e limites do exercício.

O segredo de MFA usa uma chave da instalação em `KM_IDENTITY_KEY`; instalações antigas usam derivação a partir do segredo do banco enquanto o valor não tiver sido configurado. A adoção ou troca da chave após matrícula requer migração explícita ou recadastro do fator. Preserve chaves separadamente sob controle do operador. Após restore local, tenants restaurados ficam suspensos e tokens, chaves de API e provas antigas deixam de autenticar. Reconciliação de tombstones e reativação real ficam nos gates do PKG-14. O procedimento local preserva snapshots e acesso de manutenção, com retomada da identidade após revisão autorizada do ciclo de vida.

## Gates e fronteiras

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install chromium
bash scripts/integration.sh
bash scripts/audit.sh
```

A suíte de integração inclui as regressões do PKG-01 e o ciclo de login/MFA, RLS, rotatividade e revogação de sessão, convite, autorização, clientes de serviço, privacidade e restore. O rollback v2 é destrutivo para os dados de identidade e reservado a um banco descartável. A autenticação federada real continua no PKG-08, os vínculos de canal em PKG-09, e as políticas nos componentes de documentos/IA entram nas fronteiras de cada domínio. Nenhum IdP ou serviço pago foi acionado.

## Concorrência e quotas dos workers

O contrato interno `tenant-probe.v1` exercita o processamento para uma empresa ativa. O Redis entrega os jobs. As reservas, quotas e recibos persistem no PostgreSQL na migração v3. Cada tenant tem até uma execução simultânea e 30 admissões em uma janela móvel de 60 s por padrão. O operador pode ajustar esses valores em `km.worker_policy`. A stack tem três slots globais para jobs com tenant. Exaustão de quota ou de slots posterga a entrega sem gastar a tentativa de erro do BullMQ. Uma nova admissão após falha ou expiração consome quota da própria empresa.

O lease dura 3 s e é renovado a cada 1 s durante a execução longa. Um token de fencing vincula a reserva global e a do tenant. A confirmação exige token atual, lease válido e tenant ativo. O efeito deste job é o recibo no mesmo commit; uma entrega repetida devolve o resultado confirmado. Integrações futuras com efeitos externos precisarão da própria garantia de idempotência. O probe original do PKG-01 continua disponível como diagnóstico da fundação.

A integração derruba a réplica responsável por um lease e verifica o progresso da outra empresa, a expiração, a retomada e a rejeição do token antigo. Também injeta uma falha transacional na primeira confirmação para observar o retry e mede eventos em `artifacts/worker-metrics.json`.
