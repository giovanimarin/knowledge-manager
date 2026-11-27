# PKG-04 — editor e publicação

1. Execute `make setup` para aplicar a migração v7. Acesse a wiki com uma sessão de usuário e abra uma página autorizada. Selecione **Abrir editor colaborativo** e **Conectar ao editor**.
2. Escolha o tipo de bloco ou use um atalho Markdown. Cada bloco tem UUID, e o conteúdo de texto usa Y.Text. A prévia Mermaid carrega sob demanda. Para imagem privada, cole a rota autenticada do anexo limpo. Links HTTPS externos exigem ação do usuário.
3. Os status indicam conexão, autosave pendente, confirmação durável e acesso revogado. Em reconexão, o cliente reapresenta operações sem ACK do mesmo estado. Uma edição externa ou restauração que troque a geração exige sincronização antes de novos updates.
4. Em **Versões, revisão e publicação**, carregue o histórico, compare versões e restaure uma revisão. Uma restauração cria nova revisão no rascunho. Configure se o espaço exige aprovação e selecione um revisor autorizado. Publique a revisão aprovada e defina validade ou próxima revisão.
5. Agende `bash scripts/local.sh editor-maintenance` no host da instalação para retirar publicações vencidas, registrar avisos de revisão e aplicar retenção. A consulta de publicação já nega versões vencidas antes dessa rotina. Publicações ativas e versões vinculadas a revisões pendentes/aprovadas ficam protegidas durante a retenção.

O WebSocket usa a mesma origem da wiki. A API autentica o primeiro frame e reaplica ACL antes de leitura e gravação. A presença usa Redis com TTL, mantendo a separação tenant/página. Snapshot, recibo, revisão e trilha gravam no PostgreSQL antes do ACK. A expiração da sessão é verificada mesmo quando o socket fica ocioso. Atualizações recusadas não geram recibo. Uma publicação referencia uma versão imutável, e o outbox contém apenas IDs/estado para posterior consumo no PKG-05.

## Validação

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install chromium
bash scripts/integration.sh
bash scripts/audit.sh
```

O smoke requer ClamAV no host para a regressão PKG-03. O relatório `artifacts/editor-g3.json` registra tempos sintéticos de confirmação concorrente, reconexão, revogação observada e reabertura após reinício. São medições de teste, não SLO. Os checks também rodam os cenários de navegador e preservam o gate da wiki, da fundação e da identidade.

[Contrato](PKG-04-contracts.md) · [Protocolo JSON](../../contracts/editor.protocol.json)
