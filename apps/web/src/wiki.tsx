import { useEffect, useState, type FormEvent } from "react";

type Space = { id: string; title: string };
type Summary = {
  id: string;
  title: string;
  parent_id: string | null;
  space_id: string | null;
  snippet: string | null;
};
type Page = Summary & { content: string; revision: number; tags: string[] };
type Comment = { id: string; body: string; resolved: boolean };
type Attachment = { id: string; filename: string; scan_state: string };
type Relation = {
  id: string;
  kind: string;
  broken: boolean;
  source_id: string;
  target_id: string;
};

export function Wiki({ token }: { token: string }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<Page>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [space, setSpace] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function call<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch("/v1/wiki" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "O documento mudou. Abra-o novamente."
          : "Operação indisponível para este acesso.",
      );
    return (await response.json()) as T;
  }
  function attempt(action: () => Promise<void>) {
    setError("");
    void action().catch((error: Error) => setError(error.message));
  }
  async function browse(scope = space, term = query) {
    const params = new URLSearchParams();
    if (scope) params.set("spaceId", scope);
    if (term) params.set("q", term);
    setPages(await call<Summary[]>("/pages?" + params));
  }
  async function open(id: string) {
    setCurrent(undefined);
    setComments([]);
    setAttachments([]);
    setRelations([]);
    const base = "/pages/" + id;
    const [page, comments, attachments, relations] = await Promise.all([
      call<Page>(base),
      call<Comment[]>(base + "/comments"),
      call<Attachment[]>(base + "/attachments"),
      call<Relation[]>(base + "/relations"),
    ]);
    setCurrent(page);
    setComments(comments);
    setAttachments(attachments);
    setRelations(relations);
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    attempt(() => action(form));
  }
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all(
      ["/spaces", "/pages"].map(async (path) => {
        const result = await fetch("/v1/wiki" + path, {
          headers: { Authorization: "Bearer " + token },
          signal: abort.signal,
        });
        if (!result.ok) throw new Error("Não foi possível abrir a wiki.");
        return await result.json();
      }),
    )
      .then(([spaces, pages]) => {
        if (!abort.signal.aborted) {
          setSpaces(spaces as Space[]);
          setPages(pages as Summary[]);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError("Não foi possível abrir a wiki.");
      });
    return () => abort.abort();
  }, [token]);

  function tree(parent: string | null) {
    const children = pages.filter(
      (page) =>
        page.parent_id === parent ||
        (parent === null && !pages.some((node) => node.id === page.parent_id)),
    );
    return children.length ? (
      <ul>
        {children.map((page) => (
          <li key={page.id}>
            <button onClick={() => attempt(() => open(page.id))}>
              {page.title}
            </button>
            {page.snippet && <p>{page.snippet}</p>}
            {tree(page.id)}
          </li>
        ))}
      </ul>
    ) : null;
  }

  return (
    <section aria-labelledby="wiki-title">
      <h2 id="wiki-title">Wiki</h2>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => submit(event, async () => browse())}>
        <label>
          Espaço{" "}
          <select
            value={space}
            onChange={(event) => {
              setSpace(event.target.value);
              attempt(() => browse(event.target.value));
            }}
          >
            <option value="">Todos os espaços</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar documentos{" "}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button>Buscar</button>
      </form>
      {tree(null)}
      <details>
        <summary>Criar espaço</summary>
        <form
          onSubmit={(event) =>
            submit(event, async (form) => {
              await call("/spaces", "POST", { title: form.get("title") });
              setSpaces(await call<Space[]>("/spaces"));
            })
          }
        >
          <label>
            Nome do espaço <input name="title" required maxLength={160} />
          </label>
          <button>Criar espaço</button>
        </form>
      </details>
      {space && (
        <details>
          <summary>Criar documento</summary>
          <form
            onSubmit={(event) =>
              submit(event, async (form) => {
                const result = await call<{ id: string }>("/pages", "POST", {
                  title: form.get("title"),
                  content: form.get("content"),
                  spaceId: space,
                });
                await browse();
                await open(result.id);
              })
            }
          >
            <label>
              Título <input name="title" required maxLength={160} />
            </label>
            <label>
              Conteúdo <textarea name="content" maxLength={50000} />
            </label>
            <button>Criar documento</button>
          </form>
        </details>
      )}
      {current && (
        <article key={current.id}>
          <h3>{current.title}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{current.content}</p>
          <details>
            <summary>Editar documento</summary>
            <form
              onSubmit={(event) =>
                submit(event, async (form) => {
                  await call("/pages/" + current.id, "PATCH", {
                    title: form.get("title"),
                    content: form.get("content"),
                    revision: current.revision,
                    tags: String(form.get("tags"))
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  });
                  await browse();
                  await open(current.id);
                })
              }
            >
              <label>
                Título{" "}
                <input name="title" defaultValue={current.title} required />
              </label>
              <label>
                Conteúdo{" "}
                <textarea name="content" defaultValue={current.content} />
              </label>
              <label>
                Tags{" "}
                <input name="tags" defaultValue={current.tags.join(", ")} />
              </label>
              <button>Salvar documento</button>
            </form>
          </details>
          <h4>Comentários</h4>
          <ul>
            {comments.map((comment) => (
              <li key={comment.id}>
                {comment.body}
                {comment.resolved ? " · Resolvido" : ""}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) =>
              submit(event, async (form) => {
                await call("/pages/" + current.id + "/comments", "POST", {
                  text: form.get("text"),
                });
                await open(current.id);
              })
            }
          >
            <label>
              Novo comentário <input name="text" required maxLength={4000} />
            </label>
            <button>Comentar</button>
          </form>
          <h4>Anexos</h4>
          <ul>
            {attachments.map((file) => (
              <li key={file.id}>
                {file.filename} ·{" "}
                {file.scan_state === "pending"
                  ? "Em quarentena"
                  : file.scan_state === "clean"
                    ? "Verificado"
                    : "Rejeitado"}
              </li>
            ))}
          </ul>
          <h4>Relações</h4>
          <ul>
            {relations.map((relation) => (
              <li key={relation.id}>
                {relation.broken ? (
                  "Link indisponível"
                ) : (
                  <button
                    onClick={() =>
                      attempt(() =>
                        open(
                          relation.source_id === current.id
                            ? relation.target_id
                            : relation.source_id,
                        ),
                      )
                    }
                  >
                    {relation.kind}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
