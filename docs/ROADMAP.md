# Roadmap e sequência de PRs

PKG-00B aceito em `63a0a98`. PKG-01 está em validação. [Acompanhamento de gates e evidências](PROGRESS.md). A primeira versão (V1) inclui todos os gates abaixo. PKG-07 é um marco testável de chat web, anterior à V1 comercial omnichannel. Horas são faixas preliminares de engenharia, incluindo testes e revisão, sem custo de serviços, filas de aprovação ou prazo de credenciais. Reestimar por integração após spikes e capacidade confirmada.

| Pacote / PRs por fronteira | Entrega | Dependências | Gate | Horas |
| --- | --- | --- | --- | --- |
| PKG-00 / PKG-00B | Auditoria e especificação | decisões main | revisão documental | já executado para revisão |
| [PKG-01](packages/PKG-01.md) | workspace/CI → Compose e instalação → backup/smoke | 00B | G1 e G2 local | 56–88 |
| PKG-02 | tenant e RLS → sessão/MFA → RBAC/ABAC → topologias híbridas executáveis | 01 | G1/G2, A/B no mesmo DB e C dedicado | 128–208 |
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

## Pré-requisito de cada pacote e marcos híbridos

Antes de implementar cada fronteira, revisar a [decomposição por capabilityId](specification/traceability.md#decomposição-obrigatória-por-pacote) e os [contratos verificáveis](specification/contracts.md#contrato-verificável-antes-da-implementação). O PR de implementação vincula esses artefatos às evidências por operação. Ao preparar release, aplicar as [aprovações pré-rollout](specification/scope-boundaries.md#aprovações-pré-rollout).

- **PKG-01:** fundação sintética, workflows obrigatórios e smoke/restore local. A aplicação do modelo de tenant começa no pacote seguinte.
- **PKG-02:** primeiro marco executável shared e dedicated da fundação de identidade/acesso. Shared executa A e B no mesmo PostgreSQL com papel de aplicação sujeito a RLS, negativos de leitura/escrita e revogação em sessão ativa. Demonstrar escala horizontal de API/workers com duas réplicas e leases/quotas preservados sob carga sintética. Dedicated inicia C em stack independente com app, workers, banco, storage, índice, fila e credenciais isolados. Provar bloqueio entre stacks e publicar roteiro e resultados. Serviços de domínio posteriores ampliam essa topologia.
- **PKG-14:** provisionamento IaC e prova operacional completa dos modos, incluindo migração, restore, carga e hardening com A/B/C e funcionalidades da V1.
