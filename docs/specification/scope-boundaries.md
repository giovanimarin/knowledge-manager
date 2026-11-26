# Paridade, escopo posterior e lacunas

A matriz usa V1 para capacidade aprovada, adaptada para desenho nativo quando escopo/processo difere, posterior para adiamento e excluído para comportamento vedado. As quatro aplicações são referências funcionais, sem integração de runtime. Evidências observadas, lacunas e licenças estão na [auditoria](../references/reuse-matrix.md). As extensões do workshop são paridade desejada ou funcionalidade própria, sem afirmar equivalência ao upstream. Docmost AGPL/Enterprise só referência, sem incorporação. AnythingLLM/Unified Channel MIT e Keycloak Apache-2.0 não dispensam revisão de dependências, ativos e termos. Antes de selecionar versão fixar SBOM e verificar licenças de SDKs, ferramentas, modelos/pesos, fontes e imagens.

| Decisão | Posterior ou excluído | Condição de retomada |
| --- | --- | --- |
| DM-08/09 | Extração wiki de áudio/vídeo/ZIP; exportadores Confluence/Notion | pacote de formatos e teste de fidelidade |
| DM-10 | Links públicos anônimos excluídos | só por nova decisão de produto/segurança |
| AL-03 | Bancos relacionais, e-mail e transcrições de reuniões | expansão de fontes com mapeamento ACL |
| AL-09 | Agentes autônomos, MCP, ferramentas customizadas, ações externas, workflows, multiagentes e execução arbitrária | toda categoria adiada, revisão explícita. Edição conversacional confirmada segue V1 |
| AL-13/14 | SDKs Python/JS, marketplace, cache semântico aproximado, roteamento automático por complexidade, escalonamento preditivo | segurança, compatibilidade e evidência de demanda |
| AL-15/16/17/18 | DLP e comportamento avançado, otimização automática/fine-tuning, busca web em tempo real/APIs de busca/pesquisa profunda, multi-banco vetorial, migração multinuvem automatizada e self-hosted comercial | iniciativas novas, ainda sem pacote aprovado |
| KC-01/02/03 | LDAP/AD direto, GitHub, Apple, SCIM e sync LDAP, editor visual avançado de políticas | federação/admin avançados |
| KC-04/05/06/07/08 | Passkeys/WebAuthn nativo, risco adaptativo, georrestrição, suspeitas avançadas, federação KM, WIF, mTLS, SIEM direto e detecção avançada | política e interoperabilidade revisadas |
| KC-09/10 | self-hosted, RH integrado e automação avançada LGPD | distribuição posterior e revisão jurídica |
| UC-01/02/03/04 | marketplace, Google Chat, Telegram, Discord, e-mail, atendimento humano no canal/helpdesk | extensões pós-V1; tickets nativos KM-07 são V1 |
| UC-06/07/08/09 | áudio sintetizado, interpretação de vídeo, chamadas, campanhas, previsão/diagnóstico IA, DLP e comportamento avançado | reavaliar custos, consentimento e dados |
| KM-01/02/03 | CRM completo, projeções financeiras IA, marketplace de consultores, multimoeda e marketplace | escopo comercial posterior |
| KM-04/05/06 | multi-cloud simultânea, autoscaling preditivo, self-hosted comercial, apps nativos, white label completo, editor avançado de temas, edição offline, ontologias complexas e competências individuais | validar demanda e suporte |
| KM-07/08 | chat humano em tempo real, helpdesk externo, CRM, agentes, marketplaces cloud, self-hosted comercial, multi-cloud simultânea | produtos/pacotes posteriores |

## Decisões materiais pendentes e dependências externas

Os 60 itens do workshop têm disposição registrada. Para execução, permanecem escolhas e aprovações que não mudam o escopo aprovado.

| Ponto | Dono/gate |
| --- | --- |
| Preços, markup efetivo, impostos, conciliação fiscal, contrato, prazos de cobrança e PSP/fiscal | proprietário/financeiro/jurídico no PKG-12B. 30% e cronograma de inadimplência são exemplos. Trial aprovado preservado, viabilidade econômica requer confirmação antes de rollout. |
| Credenciais, escopos externos, custos de API/modelo/infra e tratamento de dados de fornecedor | proprietário e responsáveis pelos sandboxes antes de G4. Não provisionar pago sem autorização. |
| Licenças de SDKs, pesos, conversores, assets e infraestrutura, incluindo componentes enterprise | responsável pelo release e jurídico na seleção. Manter bloqueio para AGPL e dependências incompatíveis. |
| Retenção/legal hold, descarte, termos/privacidade e SLA de suporte | responsável/jurídico antes de produção. Defaults aprovados de trial/vínculo/lixeira permanecem; exemplos financeiros e SLA não constituem compromisso. |
| Hospedagem/volume, capacidade real Ollama, pesos e qualidade de governança, SLOs e assets definitivos | benchmarks de pacote, revisão de produto e operação. Usar tokens e geometria aprovados enquanto assets finais não chegam. |
| Membros coletivos verificáveis, APIs interativas/revogação real, ACL de origem e fidelidade de formato | verificar capacidades por versão/fornecedor. Quando ausentes, aplicar negação, quarentena, perda explícita ou redirecionamento privado conforme contrato. |

## Aprovações pré-rollout

Registrar decisão, responsável, data, escopo, versão e evidência no relatório de release. Pendência impede rollout da capacidade afetada; PKG-15 consolida o gate antes do piloto comercial e da disponibilidade geral.

| Aprovação | Quando e por quem |
| --- | --- |
| Preço, catálogo, PSP/fiscal, impostos e condições contratuais | PKG-12B, antes de cobrança real; produto, financeiro e jurídico. |
| Licença de cada modelo/peso e SDK, termos e tratamento de dados de fornecedor | Pacote consumidor, antes de incorporar artefato ou habilitar integração; release e jurídico. |
| Assets visuais definitivos e direitos de uso | PKG-12/15 antes da publicação da marca; produto e responsável pela marca. |
| Políticas de dados, retenção, descarte, privacidade e termos contratuais | PKG-12/14 antes de entrada de dados reais; produto, privacidade e jurídico. |

Trial mantém **14 dias, 10 colaboradores, 1 GB e R$20 de crédito comercial, sem cartão**, configurável pela plataforma. Aprovação econômica e política comercial cabem ao rollout sem inferir mudança dos defaults. PKG-01 não depende de pagamentos, contratação ou credenciais externas.
