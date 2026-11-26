# Auditoria de consistência do PKG-00B

## Entradas e precedência

Leitura dos cinco registros normativos em `0e6090de027013584e1ce0111b2ff91006733e2b` e do [comentário do proprietário](https://github.com/giovanimarin/knowledge-manager/issues/3#issuecomment-7201079841). O [PR #2](https://github.com/giovanimarin/knowledge-manager/pull/2) estava aberto e seu head `ba8d79d` não integrava main. A branch PKG-00B foi criada de main e recebeu os dois commits de auditoria e revisão via cherry-pick. Os cinco arquivos normativos foram preservados. O PKG-00 contém evidências upstream; mudança de escopo vem do workshop.

| Divergência encontrada | Reconciliação |
| --- | --- |
| Doze RFs macro do PKG-00 e 60 decisões do workshop | Manter RF-01 a RF-12, ampliar RF-13 a RF-18 e decompor por decisão e capacidade na matriz. IDs repetidos entre auditoria e decisões têm namespace documental distinto. |
| Slack posterior no baseline | Slack em V1 com gate real próprio; web é marco intermediário, não substitui os canais corporativos. |
| Coletivo bloqueado genericamente e nova decisão condicional | Autorizar somente com conjunto verificável de destinatários e autorização atual de todos; redirecionar para conversa individual quando indisponível. |
| Áudio aprovado em canal e extração de áudio adiada na wiki | Transcrição de entrada temporária em V1. Armazenamento wiki aprovado; extração automática de áudio/vídeo/ZIP adiada. |
| SSO inicial com subconjunto e prova parcial | Adicionar Cognito e OIDC/SAML genéricos; preservar gate AWS e medir revogação real por provedor. Provisionamento local/manual e suspensão local independem dessa prova. |
| Chat conversacional e AL-09 adiada | Preparar rascunho ou contribuição confirmada na interface autorizada, sem MCP/ações externas ou publicação automática. |
| Retenção e restore versus revogação | Tombstones e política atual antes de reabrir acesso, pausa de cutover e reindexação derivada. Versão anterior só serve enquanto elegível. |
| Backup local do PKG-01 versus modos comerciais | Smoke e restore descartável na fundação; G5 prova restore/migração reais para dois compartilhados e um dedicado. Self-hosted comercial adiado. |
| Custos de API, trial e cobrança | Preservar limites aprovados, distinguir unidades reais/comerciais/internas e reservar orçamento. Seleção de fornecedor, preço e economia do trial dependem de gate explícito. |
| Mock, SLO, exemplos de workshop | Mock prova contrato. Resultado local, sandbox e piloto exigem evidências próprias. Manter parâmetros ilustrativos como hipóteses. |

## Verificações documentais

- Inventário por arquivo e comparação com a matriz: 15 DM + 18 AL + 10 KC + 9 UC + 8 KM, 60 IDs únicos, cada qual com fase, RF, tela, contrato, entidades, pacote ou destino posterior, e cenário. 59 categorias V1, AL-09 posterior. Subfuncionalidades futuras aparecem na linha ou no inventário de limites e foram conferidas contra os cinco registros.
- Os cinco arquivos normativos são idênticos a main. Scripts temporários em Python validaram 161 links locais ou fixados (arquivos, objetos Git e intervalos de linhas), 18 RFs, 10 telas, 10 contratos, entidades, 18 pacotes de implementação em DAG e faixas válidas. `git diff --cached origin/main --check` passou. O diff contém somente Markdown. Revisão manual das quatro referências e dos fluxos transversais na tabela acima.
- Critérios de saída desta issue: [mapa de entregáveis](../packages/PKG-00B.md). A [política de qualidade](quality.md) define evidências de execução futuras. As verificações deste PR incidem sobre a documentação.

A única suíte executada na auditoria anterior foi o recorte de 39 testes no Unified Channel. Seu resultado continua registrado em [PKG-00](../references/verification.md). O KnowledgeManager ainda não tem implementação nem CI próprios. Não houve integração ao vivo, provisionamento pago, SLO medido, evidência WCAG de produto ou artefatos de runtime neste pacote.

## Revisão final e lacunas

Revisar escopo e contratos no PR antes do PKG-01. Valores comerciais, fiscal, provedor, licença, sandboxes, ativos, retenção, capacidade de operação, precisão de governança e metas de desempenho seguem os responsáveis e gates em [limites](scope-boundaries.md). Detalhes reversíveis adotados nesta especificação incluem identificadores C/U/G, estados, CAS e separação dos PRs 11S, 12B e 13S; ficam sujeitos à revisão técnica sem reabrir decisões do workshop.

## Revalidação após a revisão do PR #4

A revisão de `47046f7` foi atendida com contratos por operação e matriz de negações, checks obrigatórios planejados para PKG-01, topologias executáveis no PKG-02, cobertura por capabilityId e aprovações pré-rollout. A consolidação já inclui a auditoria do PR #2. Se houver integração separada desse PR, preservar a documentação consolidada no PKG-00B.

- A comparação com main confirmou os cinco registros normativos intactos e 60 IDs únicos: 59 categorias V1 e AL-09 adiada. A matriz referencia 18 RFs, 10 telas, 10 famílias de contrato, entidades existentes e 18 pacotes com dependências acíclicas e faixas válidas.
- Scripts locais verificaram 168 links em docs, entre caminhos locais e referências fixadas, e 8 âncoras Markdown locais. `git diff --cached origin/main --check` passou.
- A comparação com o head revisado confirmou ausência de alterações em decisões, ADRs e demais baselines de arquitetura, tabelas de requisitos e escopo em PRODUCT.md. As mudanças são Markdown.
- A evidência desta rodada é documental. Checks de branch, smoke, SBOM em CI, isolamento executável e gates de sandbox/produção são entregas futuras.
