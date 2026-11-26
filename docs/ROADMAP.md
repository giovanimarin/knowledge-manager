# Roadmap

Estado do PKG-00: documentação e auditoria submetidas à revisão na issue #1. [Evidências e verificações](references/verification.md). Os intervalos são horas de engenharia propostas, incluindo teste e revisão, sujeitos à capacidade e à validação das integrações. Segurança, documentação e testes são contínuos desde a fundação.

| Pacote | Entrega | Dependências | Horas |
| --- | --- | --- | --- |
| PKG-00 | Auditoria, licenças, macro-requisitos rastreáveis e ADRs | — | 24–40 |
| [PKG-01](packages/PKG-01.md) | Fundação, CI e Compose | 00 | 40–56 |
| PKG-02 | Organizações, identidade local e isolamento | 01 | 56–80 |
| PKG-03 | Espaços, conteúdo, anexos e busca | 02 | 48–72 |
| PKG-04 | Editor, colaboração, publicação e versões | 03 | 64–96 |
| PKG-05 | Extração, embeddings e ativação de índice | 04 | 48–72 |
| PKG-06 | RAG, citações e avaliação | 05 | 48–72 |
| PKG-07 | Chat web, primeiro MVP | 06 | 32–48 |
| PKG-08 | SSO e associação corporativa | 02 | 40–72 |
| PKG-09 | Núcleo omnichannel | 07 | 40–64 |
| PKG-10 | WhatsApp oficial | 09, conta Meta de teste | 24–40 |
| PKG-11 | Teams oficial | 09, tenant Microsoft de teste | 32–56 |
| PKG-12 | Administração | 07, 08, 09 | 32–56 |
| PKG-13 | Analytics | 12 | 24–40 |
| PKG-14 | Hardening, LGPD e qualidade de release | 10, 11, 13 | 40–64 |
| PKG-15 | Distribuição e operação | 14 | 24–40 |

Os 12 macro-requisitos do PKG-00 serão detalhados nos pacotes responsáveis em fluxos, regras, casos de erro e testes de aceite ligados aos IDs RF originais. [Macro-requisitos](requirements/functional-requirements.md) · [ADRs](architecture/technology-selection.md).

08 pode correr em paralelo a 03–07 depois de 02. 10 e 11 podem correr em paralelo depois de 09, condicionados a credenciais e autorização para eventuais custos. A estimativa anterior de 592 horas era preliminar. Validar cronograma e disponibilidade após revisão de 00 e dimensionamento de 01.
