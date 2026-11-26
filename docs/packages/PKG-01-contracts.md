# Contratos verificáveis do PKG-01

Base C10. [OpenAPI](../../contracts/foundation.openapi.json) define os endpoints GET de API e worker. Sem parâmetros nem efeito de escrita. A tela de ambiente U10 consulta a API no mesmo origin e renderiza estado disponível, carregando ou indisponível com botão para nova consulta. O worker é acessado apenas na rede interna. Sondas públicas retornam estado agregado sem credenciais, topologia ou erro interno. 503 com Problem Details indica dependência indisponível. Polling é idempotente.

O [schema operacional](../../contracts/foundation.operations.json) versiona comandos, manifesto e trabalho BullMQ interno. Operações Compose exigem acesso ao daemon local e não têm rota pública. Logs de diagnóstico são redigidos. A fila aceita somente nome e payload v1 validados; o ID sintético é a chave idempotente de gravação no banco. Retry após falha transitória preserva unicidade; payload inválido falha sem escrita. Sem autenticação de produto neste pacote: os casos RLS usam somente dados sintéticos e papéis restritos.

| CapabilityId → RF/U/C | Política, transições e fixtures |
| --- | --- |
| KM-08.setup → RF-18/U10/C10 | Checkout limpo → dependências saudáveis → migração → pronto. Reexecução usa a mesma configuração. Negativos: migração sem privilégio, pré-requisito ausente e schema incompatível. |
| KM-08.smoke → RF-18/U10/C10 | Health continua vivo com PostgreSQL parado; readiness 503 recupera após reinício. Job v1 chega ao worker, grava uma vez; payload inválido não grava. Fixture RLS prova A/B sem escopo e tentativa de escrita cruzada. |
| KM-08.backup → RF-18/C10 | Pausar processos escritores; exportar DB e storage, gerar manifesto SHA-256 e publicar diretório completo atomicamente. Falha mantém backup anterior intacto. |
| KM-08.restore → RF-18/C10 | Destino descartável vazio → manutenção → verificar versão e checksums → restaurar → validar schema/objetos/RLS → liberar. Entrada incompleta ou falha parcial mantém serviços indisponíveis. Repetir em destino novo se a escrita começou. Tombstones e ACL de produto serão implementados pelos pacotes responsáveis; validação sintética não substitui esses gates. |

Evidência por operação: resultados locais, execução de CI e runbook do pacote. Sandbox e produção seguem os gates posteriores.
