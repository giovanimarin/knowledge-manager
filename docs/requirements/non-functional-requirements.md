# Requisitos não funcionais

Alvos iniciais propostos para revisão. PKG-01 define ambiente e protocolo de benchmark; PKG-05 a PKG-07 medem o caminho do MVP.

| ID | Alvo e evidência esperada |
| --- | --- |
| RNF-01 | Zero regressões nas suítes de isolamento, revogação e validação de entrada. Verificar política em API, jobs, colaboração, índice, cache, citações, histórico e objetos. |
| RNF-02 | Em 4 vCPU/16 GB, amostra com 10 tenants, 100 mil chunks e 20 usuários simultâneos: p95 de API leitura ≤ 300 ms e recuperação autorizada ≤ 750 ms, ambos fora da geração de modelo; medir p50/p95/p99, recall e latência por etapa. |
| RNF-03 | Job durável recuperável após reinício de worker/Redis. Teste de backup e restore trimestral com objetivo inicial RPO ≤ 24h e RTO ≤ 4h; tombstones e ACL revalidados no restore. |
| RNF-04 | Aderência WCAG 2.2 AA nas jornadas MVP com testes automatizados e teclado/leitor de tela; strings pt-BR e en com fallback explícito e datas localizadas. |
| RNF-05 | LGPD com registro de finalidades, retenção configurável aprovada, exportação e expurgo por usuário. Testar eliminação de dados ativos e documentação da janela de backups. |
| RNF-06 | Avaliação RAG reprodutível com fixtures pt-BR/en, mock gratuito e relatório por tenant: recall@10 ≥ 0,85, ≥ 95% citações válidas e ≥ 90% abstenção em questões sem evidência, zero vazamentos no conjunto negativo. Baseline e revisão do conjunto em PKG-06. |
| RNF-07 | Traces com correlação entre API/outbox/worker, métricas de latência/atraso/erros/DLQ e logs estruturados sem conteúdo ou segredos. Demonstrar alerta de fila bloqueada em cenário local. |
| RNF-08 | CI executa lint, typecheck, unit, integração, regras de arquitetura, análise de dependências/segredos e E2E do escopo entregue. Provedores fake offline, SBOM e workflow com permissões mínimas. |

[Roadmap e dependências](../ROADMAP.md) · [Segurança](../architecture/security-model.md).
