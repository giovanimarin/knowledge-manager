# AnythingLLM — decisões de escopo do KnowledgeManager

Status: aprovado pelo responsável do produto em 2026-11-26. 18 decisões, 17 aprovadas (algumas com itens futuros), AL-09 adiada. IDs de produto não equivalem aos IDs da auditoria técnica. Referência funcional, não integração do aplicativo existente. Auditoria PKG-00 no PR #2, revisão ba8d79de35d35b7e04e334d913f6667084834e2e; AnythingLLM b01447009150507ae0cfd1304e3492fcaf2a92d8. As extensões abaixo são requisitos próprios, não alegações de paridade verificada. Incorporar à PKG-00B antes da implementação.

## AL-01 — LLM
Ollama local, OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock e API OpenAI-compatible. Configuração por empresa, múltiplos provedores/modelos, padrão por empresa e configuração por espaço, temperatura, limites de tokens/contexto, credenciais cifradas, teste de conexão, consumo e fallback previamente autorizado. Processamento local sem envio externo. Testes comerciais reais dependem de credenciais autorizadas; desenvolvimento inicial local sem APIs pagas.

## AL-02 — Embeddings
Ollama e Hugging Face compatível local, OpenAI, Gemini, Azure, Bedrock, Cohere e API compatível. Configuração independente do LLM por empresa, suporte multilíngue pt/en, teste de conexão, consumo e desempenho. Troca de modelo exige reindexação com progresso e ativação atômica; manter índice anterior válido e autorizado até conclusão. Reutilizar embeddings inalterados com mesmo modelo/configuração, isolados por empresa. PostgreSQL/pgvector inicial.

## AL-03 — Fontes de conhecimento
Wiki como fonte primária interna; fontes externas integradas ao mesmo gerenciador, espaços, governança, permissões e publicação, sem módulo de conhecimento paralelo. Documentos/uploads, URLs/crawler, GitHub, GitLab, Bitbucket, Drive, SharePoint, OneDrive, Confluence, Notion, REST, S3 e GCS. Credenciais por empresa/espaço, sincronização manual/agendada, incremental incluindo exclusões, status, erros, tentativas, rastreabilidade, publicação automática autorizada ou aprovação. Preservar ACL de origem; negar disponibilização automática quando ACL desconhecida. Bancos relacionais, e-mail e transcrições de reuniões posteriormente.

## AL-04 — Chunking
Estrutural por títulos, seções, parágrafos e blocos, contexto hierárquico, tratamento de tabelas/listas/código, tamanho e overlap configuráveis, estratégias por tipo, IDs estáveis/hash, atualização incremental, deduplicação sem violar ACL/tenant, referência a documento/versão/seção e inspeção administrativa.

## AL-05 — Recuperação RAG
Busca híbrida textual e semântica, reranking, metadados, documentos relacionados, contexto adjacente, limiar de relevância, orçamento de tokens, deduplicação e autorização antes da recuperação. Testes de qualidade, desempenho e isolamento.

## AL-06 — Respostas fundamentadas
Citações inline com links diretos à seção, trechos, versão/data, contradições, abstenção quando evidência insuficiente e indicação de resposta parcial. Validar existência e recuperação das fontes, rastrear evidências e reautorizar histórico. Sem porcentagem artificial de confiança nem promessa de ausência de alucinações.

## AL-07 — Conversas
Canais corporativos como experiência principal (Teams, WhatsApp, Slack; prioridade de cada integração a decidir no bloco Unified Channel). Interface web mantida para conversar, gerenciar histórico e atualizar conhecimento. Consulta global autorizada ou contextual, histórico pessoal, streaming/cancelamento/regeneração/edição com ramificação, anexos temporários, renomear/buscar/favoritar/arquivar/excluir, exportar Markdown/PDF, compartilhar com autorização, feedback, sugestões, seleção de modelo autorizado. Histórico por identidade e origem do canal. Privado por padrão; revalidar ACL de fontes em histórico e compartilhamento. Conversa/anexo não vira conhecimento oficial automaticamente; conversão em documento via fluxo de publicação. Escopo selecionado apenas restringe permissões.

## AL-08 — Personalização
Hierarquia: segurança obrigatória da plataforma, empresa, espaço, canal e preferências do usuário; níveis inferiores não contornam segurança. Instruções, glossário, idioma, tom, detalhe, formato por canal, configuração versionada/restaurável, teste antes da publicação e auditoria. Modo corporativo padrão; complemento geral explicitamente identificado quando autorizado. Citações não desativáveis; autorização no backend.

## AL-09 — Agentes (ADIADO)
Adiar agentes autônomos, MCP, ferramentas personalizadas, chamadas de ações externas, workflows, multiagentes e execução arbitrária. Manter geração de conteúdo e atualização da wiki via interface conversacional conforme AL-07, com autorização, confirmação e publicação; não reintroduzir automação externa.

## AL-10 — Sincronização
Eventos após publicação, agendamento de fontes externas, webhooks compatíveis, atualização manual, processamento incremental, controle de versões, exclusões/revogações prioritárias, retries, notificações de falha, reprocessamento por documento/espaço, status e histórico. Ativar versão somente após processamento completo e publicação autorizada; versão anterior somente enquanto válida/autorizada. Falhas não corrompem índice. Não contornar aprovação.

## AL-11 — Feedback e lacunas
Avaliação de utilidade, sinalização de erros, perguntas sem resposta, agrupamento semântico, prioridade por frequência/impacto, contradições e possível obsolescência, sugestões de criação/atualização, encaminhamento a responsáveis e acompanhamento até resolução. Feedback não modifica conhecimento oficial; revisão/publicação obrigatórias. Gestores limitados ao escopo autorizado, privacidade das conversas. Ausência de resposta pode indicar falha de recuperação/indexação/autorização, não necessariamente lacuna.

## AL-12 — Monitoramento e monetização
Indicadores de adoção, conversas/canais, documentos/espaços, tokens entrada/saída por modelo/provedor, embeddings, armazenamento, latência, falhas e custos. Visões de plataforma (sem acesso ao conteúdo por padrão), empresa e gestor de espaço. Limites, alertas, orçamento mensal, CSV, histórico. Mensalidade fixa explícita + consumo efetivo de storage, LLM, embeddings, processamento e infraestrutura. Markup configurável por recurso (30% exemplo, não preço aprovado). Medição individual por tenant, catálogo de preços versionado, rateio mensurável sem dupla cobrança, histórico de preços/consumo, extrato, conciliação com custos reais. Cliente vê preços comerciais unitários, quantidades, mensalidade, totais e projeção; custo original, markup e margem internos exclusivos da administração da plataforma, protegidos também em APIs/backend/exportações. Não apresentar preço comercial como tarifa original do provedor. LLM local tem custo computacional mesmo sem tarifa de API. Faturamento automático e meios de pagamento a decidir no bloco próprio KM.

## AL-13 — API
REST versionada, OpenAPI, consulta IA, busca textual/semântica, criar/atualizar documentos, upload, consultar espaços/documentos/status de indexação, credenciais e permissões específicas, rate limits, medição por integração, webhooks de eventos. Identidade delegada respeita usuário; automações com identidade própria restrita. Consumo atribuído à empresa. SDKs Python/JS e marketplace futuros. API recebendo chamadas não implica agentes externos.

## AL-14 — Eficiência
Cache de respostas equivalentes com contexto compatível, embeddings e recuperação; invalidação automática, batches, concorrência, filas prioritárias, orçamento de contexto/histórico, reutilização de conexões, métricas de economia. Sem cache compartilhado entre empresas; reautorizar fontes atuais, considerar versões, modelo, instruções, contexto e permissões; invalidar alterações/exclusões/revogações. Cobrar somente recursos efetivamente usados, sem tokens fictícios. Cache semântico aproximado, roteamento automático por complexidade e escalonamento preditivo futuros. Aplicar confidencialidade comercial AL-12.

## AL-15 — Segurança de IA
Defesas contra prompt injection e extração de instruções, isolamento, autorização pré-recuperação, revalidação de fontes, proteção de histórico/cache, políticas de envio externo e confidencialidade por espaço, mascaramento configurável, auditoria, rate limits e testes de segurança. Público/interno: provedores autorizados; confidencial: provedores específicos ou local; restrito: local ou indisponível para IA, conforme política. Aplicar a geração, embeddings, reranking e demais transmissões. Credenciais nunca no prompt. Filtros não substituem autorização backend nem garantem imunidade. DLP corporativo e detecção comportamental avançada futuros.

## AL-16 — Avaliação
Perguntas/respostas/fontes esperadas, ambiente de testes, comparação de LLM, embeddings e RAG, precisão de citações, abstenção, latência/custo, histórico, regressão antes de mudanças. Registrar versões/configurações, isolamento de produção, mesmas políticas de segurança, validação humana complementa avaliação automática, estimativa e limites de consumo, preços comerciais sem markup, promoção somente aprovada. Otimização automática e fine-tuning futuros.

## AL-17 — Conhecimento geral
Modo corporativo padrão; complemento geral do LLM explicitamente distinguido, configurável por empresa/espaço e usuário autorizado. Sugestão de inclusão na wiki via publicação, nunca incorporação automática. Pesquisa web em tempo real, APIs de busca e pesquisa aprofundada futuras; fontes externas cadastradas AL-03 continuam aprovadas.

## AL-18 — Portabilidade
Troca de LLM sem perda de conhecimento, troca de embeddings com reindexação, abstração de storage, exportação completa de conhecimento/metadados/configurações e histórico autorizado, backup/restore individual por empresa, migração compartilhado para dedicado, reconstrução de índices e validação de integridade. Originais são fonte da verdade, índices derivados; sem segredos ou composição comercial interna nas exportações. Preservar ACL, relações, versões e retenção; não ressuscitar exclusões permanentes. Testes automatizados de portabilidade. Migração multinuvem automatizada, self-hosted pelo cliente e múltiplos bancos vetoriais futuros.

## Encaminhamento
PKG-00B deve detalhar contratos, jornadas, critérios verificáveis, dependências, estimativas, licenças e testes, conciliando com decisões Docmost e posteriores. Nenhuma implementação ou integração real é comprovada por este registro.
