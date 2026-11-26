# Licenças do PKG-01

O SBOM CycloneDX abrange workspace e imagens de API/worker, web, PostgreSQL/pgvector e Redis. O gate npm rejeita expressões não revisadas. Lightning CSS e seus binários por plataforma, MPL-2.0, são ferramentas transitivas de build do Vite. Os artefatos CSS gerados são do projeto. Se redistribuir a ferramenta modificada, tratar licenças e fontes aplicáveis ao componente. O scanner inventaria licenças em cada imagem.

Redis 8.2 é executado como serviço externo em imagem oficial fixada por digest. Versões Redis 8 oferecem AGPL-3.0 como opção além de RSALv2 e SSPLv1. Este pacote não incorpora código-fonte do Redis nem republica sua imagem. Antes de redistribuir imagens ou produzir oferta comercial, revisar obrigações de licenças/avisos da distribuição e condições por serviço. PostgreSQL/pgvector, Node e Nginx são instalados por imagens upstream identificadas por digest, com licenças e dependências do sistema enumeradas nos artefatos de auditoria. A revisão de modelos, SDKs não usados e distribuição comercial permanece nos gates aprovados.

[Política de seleção e lançamento](../specification/scope-boundaries.md#aprovações-pré-rollout).
