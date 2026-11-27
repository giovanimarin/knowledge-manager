import { useState, type FormEvent } from "react";
type Revision = {
  revision: number;
  title: string;
  actor_id?: string;
  saved_at?: string;
};
type Diff = {
  before: number;
  after: number;
  changes: {
    id: string;
    before: { text: string } | null;
    after: { text: string } | null;
  }[];
};
type Review = {
  id: string;
  revision: number;
  reviewer_id: string;
  status: string;
};

export function EditorHistory({
  pageId,
  spaceId,
  token,
  sequence,
}: {
  pageId: string;
  spaceId: string | null;
  token: string;
  sequence: number;
}) {
  const [versions, setVersions] = useState<Revision[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [diff, setDiff] = useState<Diff>();
  const [message, setMessage] = useState("");
  const [notification, setNotification] = useState<string>();
  const [published, setPublished] = useState<Revision>();
  const path = "/pages/" + pageId;
  async function call<T>(
    suffix: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch("/v1/editor" + suffix, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "A revisão mudou. Aguarde a sincronização."
          : "Operação indisponível para este acesso.",
      );
    return (await response.json()) as T;
  }
  function attempt(action: () => Promise<void>) {
    setMessage("");
    setNotification(undefined);
    void action().catch((error: Error) => setMessage(error.message));
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    attempt(() => action(form));
  }
  async function loadReviews() {
    setReviews(await call(path + "/reviews"));
  }

  return (
    <details>
      <summary>Versões, revisão e publicação</summary>
      {message && <p role="alert">{message}</p>}
      {notification && <p role="status">{notification}</p>}
      <button
        type="button"
        onClick={() =>
          attempt(async () => {
            setVersions(await call(path + "/versions"));
          })
        }
      >
        Carregar versões
      </button>
      <ol>
        {versions.map((version) => (
          <li key={version.revision}>
            Revisão {version.revision} · {version.title}{" "}
            {version.saved_at &&
              new Date(version.saved_at).toLocaleString("pt-BR")}
            {version.actor_id && <small> · Autor {version.actor_id}</small>}
            <button
              type="button"
              onClick={() =>
                attempt(async () => {
                  setDiff(
                    await call(
                      path + "/versions/" + version.revision + "/diff",
                    ),
                  );
                })
              }
            >
              Comparar revisão {version.revision}
            </button>
            <button
              type="button"
              onClick={() =>
                attempt(async () => {
                  await call(
                    path + "/versions/" + version.revision + "/restore",
                    "POST",
                    { expectedRevision: sequence },
                  );
                  setVersions(await call(path + "/versions"));
                  setNotification("Nova revisão criada.");
                })
              }
            >
              Restaurar revisão {version.revision}
            </button>
          </li>
        ))}
      </ol>
      {diff && (
        <section aria-label="Comparação de versões">
          <h5>
            Revisões {diff.before} e {diff.after}
          </h5>
          {!diff.changes.length && (
            <p>Sem diferenças no conteúdo dos blocos.</p>
          )}
          <ul>
            {diff.changes.map((change) => (
              <li key={change.id}>
                {change.before && <del>{change.before.text}</del>}{" "}
                {change.after && <ins>{change.after.text}</ins>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        onSubmit={(event) =>
          submit(event, async (form) => {
            await call(path + "/reviews", "POST", {
              reviewerId: form.get("reviewer"),
              expectedRevision: sequence,
            });
            await loadReviews();
          })
        }
      >
        <label>
          Identificador do revisor <input name="reviewer" required />
        </label>
        <button>Solicitar revisão</button>
      </form>
      <button type="button" onClick={() => attempt(loadReviews)}>
        Carregar revisões para aprovação
      </button>
      <ul>
        {reviews.map((review) => (
          <li key={review.id}>
            Revisão {review.revision} · {review.status}
            {review.status === "pending" &&
              [true, false].map((approved) => (
                <button
                  type="button"
                  key={String(approved)}
                  onClick={() =>
                    attempt(async () => {
                      await call(
                        path + "/reviews/" + review.id + "/decision",
                        "POST",
                        { approved },
                      );
                      await loadReviews();
                    })
                  }
                >
                  {approved ? "Aprovar" : "Rejeitar"}
                </button>
              ))}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) =>
          submit(event, async (form) => {
            const version = String(form.get("revision") ?? "");
            const expires = String(form.get("expires") ?? "");
            const review = String(form.get("reviewAt") ?? "");
            await call(path + "/publication", "POST", {
              expectedRevision: sequence,
              ...(version ? { revision: Number(version) } : {}),
              ...(expires
                ? { expiresAt: new Date(expires).toISOString() }
                : {}),
              ...(review ? { reviewAt: new Date(review).toISOString() } : {}),
            });
            setPublished(await call(path + "/publication"));
            setNotification("Publicação disponível.");
          })
        }
      >
        <label>
          Revisão para publicar{" "}
          <input
            type="number"
            name="revision"
            min="1"
            placeholder={String(sequence)}
          />
        </label>
        <label>
          Validade <input name="expires" type="datetime-local" />
        </label>
        <label>
          Revisar em <input name="reviewAt" type="datetime-local" />
        </label>
        <button>Publicar revisão</button>
      </form>
      <button
        type="button"
        onClick={() =>
          attempt(async () => {
            setPublished(await call(path + "/publication"));
          })
        }
      >
        Ver revisão publicada
      </button>
      {published && (
        <p>
          Publicada: revisão {published.revision} · {published.title}
        </p>
      )}
      <button
        type="button"
        onClick={() =>
          attempt(async () => {
            await call(path + "/publication", "DELETE", {
              expectedRevision: sequence,
            });
            setPublished(undefined);
            setNotification("Publicação arquivada.");
          })
        }
      >
        Arquivar publicação
      </button>
      {spaceId && (
        <details>
          <summary>Política do espaço</summary>
          <form
            onSubmit={(event) =>
              submit(event, async (form) => {
                await call("/spaces/" + spaceId + "/policy", "PATCH", {
                  approvalRequired: form.get("approval") === "on",
                  retentionDays: Number(form.get("retention")),
                });
                setNotification("Política salva.");
              })
            }
          >
            <label>
              Exigir aprovação <input name="approval" type="checkbox" />
            </label>
            <label>
              Retenção de versões em dias{" "}
              <input
                name="retention"
                type="number"
                min="1"
                max="3650"
                defaultValue="365"
                required
              />
            </label>
            <button>Salvar política</button>
          </form>
        </details>
      )}
    </details>
  );
}
