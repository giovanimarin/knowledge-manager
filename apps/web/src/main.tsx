import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Identity } from "./identity";

function App() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/readyz", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    })
      .then(async (response) => {
        const result: unknown = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) {
          setState(
            response.ok &&
              typeof result === "object" &&
              result !== null &&
              "status" in result &&
              result.status === "ready"
              ? "ready"
              : "unavailable",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("unavailable");
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <main>
      <header>
        <strong>Knowledge</strong>
        <span>Manager</span>
      </header>
      <section aria-labelledby="environment">
        <h1 id="environment">Estado do ambiente</h1>
        <p role="status" data-state={state}>
          {state === "loading"
            ? "Verificando serviços…"
            : state === "ready"
              ? "Ambiente disponível"
              : "Ambiente indisponível"}
        </p>
        <button
          disabled={state === "loading"}
          onClick={() => {
            setState("loading");
            setAttempt(attempt + 1);
          }}
        >
          Verificar novamente
        </button>
      </section>
      <Identity />
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
createRoot(root).render(<App />);
