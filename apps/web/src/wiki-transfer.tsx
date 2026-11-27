import { useState, type FormEvent } from "react";

type Call = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Job = { id: string; status: string };
type Manifest = { losses: string[] };
type Output = { filename: string; contentType: string; data: string };

const labels = {
  markdown: "Markdown",
  html: "HTML",
  word: "Word",
  pdf: "PDF",
  zip: "ZIP de espaço",
  confluence: "Confluence",
  notion: "Notion",
};

export function downloadFile(filename: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function encode(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(""));
}

export function WikiTransfer({
  call,
  spaceId,
  pageId,
  refresh,
}: {
  call: Call;
  spaceId: string;
  pageId?: string | undefined;
  refresh: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [files, setFiles] = useState<Output[]>([]);
  const [manifest, setManifest] = useState<Manifest>();
  const [busy, setBusy] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: "import" | "export",
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const format = String(form.get("format"));
    setBusy(true);
    setMessage("");
    setProblem("");
    setFiles([]);
    setManifest(undefined);
    try {
      let body: Record<string, unknown>;
      if (kind === "export") {
        if (format === "zip" && spaceId) body = { format, spaceId };
        else {
          if (!pageId) throw new Error("Abra o documento que deseja exportar.");
          body = { format, pageIds: [pageId] };
        }
      } else {
        const files = form.getAll("file");
        const valid = files.filter(
          (file): file is File => file instanceof File && file.size > 0,
        );
        if (
          !valid.length ||
          valid.length > 20 ||
          valid.reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024
        )
          throw new Error(
            "Selecione até 20 arquivos com tamanho total de até 8 MiB.",
          );
        if (["zip", "confluence", "notion"].includes(format)) {
          if (valid.length !== 1)
            throw new Error("Selecione um único arquivo ZIP.");
          body = { format, spaceId, data: await encode(valid[0]!) };
        } else {
          const items = await Promise.all(
            valid.map(async (file) => {
              const title = file.name.replace(/\.[^.]+$/, "").slice(0, 160);
              return ["markdown", "html"].includes(format)
                ? { title, content: await file.text() }
                : { title, data: await encode(file) };
            }),
          );
          body = { format, spaceId, items };
        }
      }
      const job = await call<Job>("/" + kind + "-jobs", "POST", body);
      const result = await call<{
        manifest: Manifest;
        items?: { id: string }[];
        files?: Output[];
        documents?: { id: string; title: string; data: string }[];
      }>("/" + kind + "-jobs/" + job.id);
      setManifest(result.manifest);
      setFiles(
        result.files?.length
          ? result.files
          : (result.documents ?? []).map((document) => ({
              filename:
                document.title.replace(/[^\p{L}\p{N}._-]/gu, "_") +
                (format === "html" ? ".html" : ".md"),
              contentType: "text/plain",
              data: document.data,
            })),
      );
      if (kind === "import") await refresh();
      setMessage(
        kind === "import"
          ? "Importação concluída como rascunho."
          : "Exportação concluída.",
      );
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="wiki-transfer-title">
      <h3 id="wiki-transfer-title">Importação e exportação</h3>
      {spaceId && (
        <form onSubmit={(event) => void submit(event, "import")}>
          <label>
            Formato de importação{" "}
            <select name="format">
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arquivo de importação{" "}
            <input name="file" type="file" multiple required />
          </label>
          <button disabled={busy}>Importar arquivo</button>
        </form>
      )}
      {(pageId || spaceId) && (
        <form onSubmit={(event) => void submit(event, "export")}>
          <label>
            Formato de exportação{" "}
            <select name="format">
              {Object.entries(labels)
                .slice(0, 5)
                .filter(([value]) => pageId || value === "zip")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={busy}>Exportar documento</button>
        </form>
      )}
      {busy && <p role="status">Processando…</p>}
      {message && <p role="status">{message}</p>}
      {problem && <p role="alert">{problem}</p>}
      {manifest && (
        <details>
          <summary>Relatório de perdas</summary>
          <ul>
            {manifest.losses.map((loss) => (
              <li key={loss}>{loss}</li>
            ))}
          </ul>
        </details>
      )}
      {files.map((file) => (
        <button
          key={file.filename}
          onClick={() =>
            downloadFile(
              file.filename,
              file.contentType === "text/plain"
                ? new TextEncoder().encode(file.data)
                : Uint8Array.from(atob(file.data), (character) =>
                    character.charCodeAt(0),
                  ),
            )
          }
        >
          Baixar {file.filename}
        </button>
      ))}
    </section>
  );
}
