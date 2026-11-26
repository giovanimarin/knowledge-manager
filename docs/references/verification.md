# Verificações e pendências do PKG-00

Auditoria documental e estática com clones rasos em diretório temporário externo ao checkout. `git clone --depth 1 https://github.com/<owner>/<repo>.git`, `git rev-parse HEAD`, `git switch --detach`, `git log -1` e `git ls-files` identificaram os commits e os arquivos rastreados. Os links abaixo incluem manifests, migrations, fontes, licenças e testes observados.

| Referência | Verificações e resultado |
| --- | --- |
| [Docmost](docmost-analysis.md) | Inspeção estática de serviços, dependências, árvores, migrations, licenças, Jest e testes de colaboração. Suíte JS não executada; requer workspace instalado e configuração do runner. |
| [AnythingLLM](anythingllm-analysis.md) | Inspeção de endpoint, stream, provedor pgvector, schemas/migrations, Jest e testes de sincronização. Suíte JS não executada; requer dependências instaladas, incluindo caminhos com Prisma e serviços. |
| [Keycloak](keycloak-analysis.md) | Inspeção de Java, POM, changelog, broker e testes. Java 21 disponível; Maven ausente no PATH, wrapper externo não executado. |
| [Unified Channel](unified-channel-analysis.md) | 39 testes passaram em 1,34 s, com Pytest 8.4.2, pytest-asyncio 0.26.0 e aiohttp 3.13.5 em venv. Primeira coleta sem aiohttp falhou com `ModuleNotFoundError`; instalar o wheel resolveu. Escopo local sem credenciais. |

```bash
python -m venv /tmp/km-audit/test-venv
/tmp/km-audit/test-venv/bin/pip install pytest==8.4.2 pytest-asyncio==0.26.0
/tmp/km-audit/test-venv/bin/pip install --only-binary=:all: aiohttp==3.13.5
cd /tmp/km-audit/unified-channel
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /tmp/km-audit/test-venv/bin/python -m pytest \
  -p pytest_asyncio.plugin -q tests/test_{types,adapter,manager,middleware,queue}.py
```

A issue pede testes seguros onde viáveis. As suítes completas de terceiros ficaram fora desta rodada. A verificação de integração foi documental: Meta Cloud API e Teams SDK são caminhos oficiais, Google e Entra documentam OIDC e AWS oferece SAML para app próprio. Nenhum login corporativo, webhook ou envio ao vivo foi executado. A prova depende de credenciais de sandbox, configuração do provedor e aprovação de custos se aplicável. [Canais](unified-channel-analysis.md) · [SSO](../requirements/functional-requirements.md#viabilidade-de-sso).

## Gates de integração

| Pacote | Evidência exigida antes do aceite da integração |
| --- | --- |
| PKG-08 | Login em sandboxes Google Workspace e Entra ID, com mapeamento e revogação. Para AWS IAM Identity Center, prova SAML com metadata, atribuições e rotação de certificado antes de declarar suporte. |
| PKG-10 | Instalação Meta de teste, webhook autenticado, envio e confirmação de status pela WhatsApp Cloud API. |
| PKG-11 | Instalação em tenant Teams de teste, atividade autenticada, resposta e entrega proativa com o SDK selecionado. |

Esses gates são dos pacotes de integração. O PKG-00 registra viabilidade documental e pré-requisitos.

## Rastreabilidade dos entregáveis

| Entregável | Evidência |
| --- | --- |
| Auditoria e classificação | [Matriz](reuse-matrix.md) e quatro análises |
| Licenças e exceções | [Análise](../licensing/license-analysis.md) |
| Arquitetura, dados e segurança | [ADRs](../architecture/technology-selection.md) · [Sistema](../architecture/system-design.md) · [Domínio](../architecture/domain-model.md) · [Banco](../architecture/database-design.md) · [Segurança](../architecture/security-model.md) · [Contratos](../architecture/api-contracts.md) |
| Requisitos e cenários de aceite | [Funcionais](../requirements/functional-requirements.md) · [Não funcionais](../requirements/non-functional-requirements.md) |
| Sequência e fundação | [Roadmap](../ROADMAP.md) · [PKG-01](../packages/PKG-01.md) |

## Validação do PR

Este PR documental ainda não tem CI próprio do KnowledgeManager. Os 39 testes passaram no checkout do Unified Channel e cobrem o comportamento local daquela referência. As integrações do KnowledgeManager seguem pendentes dos gates acima.

- `git diff --cached --check` verificou espaços em branco do diff.
- Um script Python percorreu os links Markdown locais e os links de código fixados. Verificou caminhos, objetos Git com `git cat-file -e` e limites dos intervalos de linhas nos clones.
- `node --check` passou em `server/utils/chats/stream.js`, `server/endpoints/chat.js` e `server/utils/vectorDbProviders/pgvector/index.js` do AnythingLLM. `xml.etree.ElementTree.parse` aceitou o POM e o changelog Liquibase principal do Keycloak. Essas verificações cobrem sintaxe, com suítes de runtime registradas acima.
