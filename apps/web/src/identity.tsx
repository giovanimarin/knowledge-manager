import { useState, type FormEvent } from "react";

type Credentials = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};
type Profile = {
  name: string;
  email: string;
  tenant: string;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
};
type Session = { id: string; created_at: string };
type Login = Credentials | { challenge: string };

async function call<T>(
  path: string,
  method = "GET",
  data?: Record<string, unknown>,
  accessToken?: string,
) {
  const response = await fetch(`/v1${path}`, {
    method,
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Muitas tentativas. Aguarde antes de repetir."
        : "A operação foi recusada. Confira os dados e suas permissões.",
    );
  return (await response.json()) as T;
}

export function Identity() {
  const [credentials, setCredentials] = useState<Credentials>();
  const [profile, setProfile] = useState<Profile>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [challenge, setChallenge] = useState<string>();
  const [uri, setUri] = useState<string>();
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState("");

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Serviço indisponível.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function load(session: Credentials) {
    const current = await call<Profile>(
      "/me",
      "GET",
      undefined,
      session.accessToken,
    );
    setProfile(current);
    setCredentials(session);
    setChallenge(undefined);
    setCode("");
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const result = await call<Login>(
        "/sessions",
        "POST",
        Object.fromEntries(data),
      );
      if ("challenge" in result) setChallenge(result.challenge);
      else await load(result);
    });
  }

  return (
    <section aria-labelledby="identity-title">
      <h2 id="identity-title">Acesso à organização</h2>
      {message && <p role="alert">{message}</p>}
      {!credentials && !challenge && (
        <form onSubmit={login}>
          <label>
            Identificador da organização{" "}
            <input name="orgHint" required autoComplete="off" />
          </label>
          <label>
            E-mail{" "}
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Senha{" "}
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>Entrar</button>
        </form>
      )}
      {challenge && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () =>
              load(
                await call<Credentials>("/mfa/challenge", "POST", {
                  challenge,
                  code,
                }),
              ),
            );
          }}
        >
          <label>
            Código de verificação{" "}
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
            />
          </label>
          <button disabled={busy}>Confirmar acesso</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge(undefined);
              setCode("");
            }}
          >
            Voltar
          </button>
        </form>
      )}
      {profile && credentials && (
        <>
          <p>
            {profile.name} · {profile.email}
          </p>
          <p>Organização: {profile.tenant}</p>
          {!profile.mfaEnrolled && !uri && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setUri(
                    (
                      await call<{ uri: string }>(
                        "/mfa/enroll",
                        "POST",
                        {},
                        credentials.accessToken,
                      )
                    ).uri,
                  );
                })
              }
            >
              Configurar autenticação em dois fatores
            </button>
          )}
          {uri && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  setCodes(
                    (
                      await call<{ recoveryCodes: string[] }>(
                        "/mfa/confirm",
                        "POST",
                        { code },
                        credentials.accessToken,
                      )
                    ).recoveryCodes,
                  );
                  setUri(undefined);
                  await load(credentials);
                });
              }}
            >
              <label>
                URI para o aplicativo autenticador{" "}
                <input value={uri} readOnly />
              </label>
              <label>
                Código de seis dígitos{" "}
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                />
              </label>
              <button disabled={busy}>Ativar segundo fator</button>
            </form>
          )}
          {codes.length > 0 && (
            <details>
              <summary>Códigos de recuperação · guarde em local seguro</summary>
              <ul>
                {codes.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </details>
          )}
          {(!profile.mfaRequired || profile.mfaEnrolled) && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setSessions(
                    await call<Session[]>(
                      "/sessions",
                      "GET",
                      undefined,
                      credentials.accessToken,
                    ),
                  );
                })
              }
            >
              Ver sessões
            </button>
          )}
          {sessions.length > 0 && (
            <ul>
              {sessions.map((session) => (
                <li key={session.id}>
                  {new Date(session.created_at).toLocaleString("pt-BR")}
                  {session.id === credentials.sessionId ? (
                    " · atual"
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await call(
                            `/sessions/${session.id}`,
                            "DELETE",
                            undefined,
                            credentials.accessToken,
                          );
                          setSessions(
                            sessions.filter((item) => item.id !== session.id),
                          );
                        })
                      }
                    >
                      Revogar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call(
                  `/sessions/${credentials.sessionId}`,
                  "DELETE",
                  undefined,
                  credentials.accessToken,
                );
                setCredentials(undefined);
                setProfile(undefined);
                setUri(undefined);
                setCodes([]);
                setSessions([]);
                setInvitation("");
              })
            }
          >
            Sair ou trocar de organização
          </button>
        </>
      )}
      {!credentials && !challenge && (
        <details>
          <summary>Aceitar convite</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              void run(async () => {
                await call("/invitations/accept", "POST", data);
                setMessage("Convite aceito. Entre na organização.");
                setInvitation("");
              });
            }}
          >
            <label>
              Prova do convite{" "}
              <input
                value={invitation}
                onChange={(e) => setInvitation(e.target.value)}
                name="proof"
                required
              />
            </label>
            <label>
              Nova senha{" "}
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy}>Aceitar convite</button>
          </form>
        </details>
      )}
    </section>
  );
}
