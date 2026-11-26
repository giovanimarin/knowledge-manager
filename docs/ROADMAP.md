# Roadmap e sequência de PRs

PKG-00B aguarda revisão final. PKG-01 começa somente após aceite da especificação ou autorização explícita. A primeira versão (V1) inclui todos os gates abaixo. PKG-07 é um marco testável de chat web, anterior à V1 comercial omnichannel. Horas são faixas preliminares de engenharia, incluindo testes e revisão, sem custo de serviços, filas de aprovação ou prazo de credenciais. Reestimar por integração após spikes e capacidade confirmada.

| Pacote / PRs por fronteira | Entrega | Dependências | Gate | Horas |
| --- | --- | --- | --- | --- |
| PKG-00 / PKG-00B | Auditoria e especificação | decisões main | revisão documental | já executado para revisão |
| [PKG-01](packages/PKG-01.md) | workspace/CI → Compose e instalação → backup/smoke | 00B | G1 e G2 local | 56–88 |
| PKG-02 | tenant e RLS → sessão/MFA → RBAC/ABAC e serviços | 01 | G1/G2, isolamento A/B | 112–176 |
| PKG-03 | wiki/hierarquia → comentários/metadata/relações → anexos/formatos | 02 | G1/G2/G3 de conteúdo | 128–216 |
| PKG-04 | editor/blocos → CRDT → versões/aprovação | 03 | G1/G3 WS e publicação | 120–192 |
| PKG-05 | eventos/gerações → extração/embeddings → conectores e ACL | 04 | G1/G3/G4 provedores e fontes | 184–320 |
| PKG-06 | recuperação/citações → modelos e instruções → avaliação | 05 | G1/G3/G4 modelos | 144–240 |
| PKG-07 | web chat → ramos/histórico/share/exports | 06 | G1/G3 E2E e revogação | 96–152 |
| PKG-08 | federação OIDC → SAML → vínculo e testes por IdP | 02 | G1/G2/G4 SSO | 96–168 |
| PKG-09 | inbox/outbox → link/política de distribuição → multimodal/avisos | 07, 08 | G1/G2/G3, falhas e identidade simuladas; G4 nos adaptadores | 128–208 |
| PKG-10 | WhatsApp Cloud API | 09 | G1/G4 Meta | 48–88 |
| PKG-11 | Teams SDK suportado | 09 | G1/G4 Teams | 56–96 |
| PKG-11S | Slack Events/Web API | 09 | G1/G4 Slack | 48–88 |
| PKG-12 | console global e admin tenant → onboarding/demo/trial → auditoria/branding | 07, 08, núcleo 09 | G1/G2, ativação e isolamento | 120–200 |
| PKG-12B | ledger/preços → orçamento/extrato → PSP, fiscal e reconciliação | 12, contratos de metering 05/06/09 | G1/G2/G4 PSP/fiscal | 144–248 |
| PKG-13 | findings/glossário → editor IA/fila/relatórios e analytics | 06, 09, 12 | G1/G3, revisão humana | 104–176 |
| PKG-13S | base oficial/assistente → tickets/diagnóstico/consentimento | 12, 07 | G1/G2/G3, escopo e SLA | 96–160 |
| PKG-14 | provisionamento IaC/modos → export/migração/restore → hardening/privacidade | 12, 12B, 10, 11, 11S, 13, 13S | G2/G5 com A/B shared e C dedicado | 152–264 |
| PKG-15 | imagens/runbooks → candidato/homolog → piloto/rollout | 14 | G5 e evidências G4 completas | 88–144 |

PKG-08 pode rodar em paralelo a conteúdo após 02. Adaptadores externos podem rodar em paralelo após 09. Billing, governança e suporte podem evoluir em PRs separados. Interfaces de tenant, mediação de segredos, contratos de uso e portabilidade nascem nas primeiras fronteiras; PKG-14 prova operação completa dos dois modos. Nenhum PR libera um fornecedor sem o gate real autorizado. Governar cada PR com IDs da matriz, contratos, migração/rollback aplicáveis e evidências.

[Mapa do PKG-00B](packages/PKG-00B.md) · [Gates](specification/quality.md) · [Adiamentos e dependências externas](specification/scope-boundaries.md).
