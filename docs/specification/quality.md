# Qualidade, evidência e gates

Cada linha da matriz define requisito → contrato → cenário e negativo. Cada PR associa IDs, fixtures, resultado por commit e ambiente, artefatos e pendências. Teste de contrato mock prova forma/transição, integração local prova componentes reais do stack, sandbox prova interoperabilidade externa autorizada e piloto mede operação. Só afirmar resultados com evidência do nível correspondente.

| Gate | Mínimo bloqueante no escopo aplicável | Evidência |
| --- | --- | --- |
| G1 PR | build, format/lint, TS strict e typecheck, unit, arquitetura, contract, integration REST/worker/DB/WS, migrations reais e Playwright do fluxo afetado. Dependências/segredos, SBOM e licenças. | saída, cobertura relevante, reports JUnit/Playwright, traces e screenshots/vídeo de falha sanitizados |
| G2 Fundação/isolamento | clean boot Compose, backup/restore com objetos, shutdown e Redis perdido; baseline com tenant A/B compartilhados e C dedicado para os pacotes que habilitam os modos. Em cada fronteira, negar A→B, shared→dedicated e acesso após revogação. | matriz por rota/estado, hashes, logs e medições RPO/RTO, sem credenciais ou conteúdo privado |
| G3 Conteúdo/RAG | concorrência WS, conversões por formato com manifesto de perdas, ACL em índice/citações/histórico/cache e stream; fixtures pt/en de recall, citação, abstenção, contradição e prompt injection; benchmark filtrado e sem filtro. | fixtures/versionamento, métricas RNF-02/06 e comparação revisável; alvos são hipóteses, sem SLO demonstrado |
| G4 Sandboxes | SSO (inclusive Cognito e SAML), fontes, modelos externos, Teams/WhatsApp/Slack, pagamentos/fiscal. Testar conexão, rotação/revogação, erros/retry, dados autorizados e callback real de fornecedor. | IDs redigidos, versão/escopos, data, operações e recibos, custo aprovado quando aplicável |
| G5 Produção | migração A/B/C, restore isolado e atualização/rollback compatível, medição/faturamento, segurança, acessibilidade/revisão manual, incidentes, performance, documentação/runbooks e nenhuma vulnerabilidade crítica pendente | relatório de candidato, BCP exercitado, SBOM de imagens, artefatos/revisão e decisão de release |

Falha bloqueante mantém vermelho, corrige causa e repete. Flake é defeito rastreado, sem skip para satisfazer status. Sem sandbox, marcar integração como pendente sem prometer disponibilidade de produção. Sanitizar evidências, definir acesso/retenção e manter diagnóstico acionável por correlation ID. Sem mídia fictícia ou simulador confundido com uso real.

Candidato → homologação → interno → piloto → geral. SemVer, imagens fixadas, dev/homolog/prod separados e fixtures sem cópia automática de produção. Migrations expand/contract, backup pré-update crítico e flags por grupo shared ou janela dedicated. Parar rollout em regressão, fix-forward ou rollback com verificação de compatibilidade e sem perder escritas novas.
