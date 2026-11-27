import { useEffect, useState } from "react";

export function Diagram({ source }: { source: string }) {
  const [view, setView] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let ignore = false;
    let objectUrl = "";
    if (
      !source.trim() ||
      source.length > 4000 ||
      source.includes("%%{") ||
      source.startsWith("---")
    )
      return;
    const timer = setTimeout(() => {
      void import("mermaid")
        .then(async ({ default: mermaid }) => {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            maxTextSize: 4000,
            maxEdges: 100,
            flowchart: { htmlLabels: false },
            fontFamily: "sans-serif",
          });
          const result = await mermaid.render(
            "wikiDiagram" + crypto.randomUUID().replaceAll("-", ""),
            source,
          );
          if (ignore) return;
          objectUrl = URL.createObjectURL(
            new Blob([result.svg], { type: "image/svg+xml" }),
          );
          setView(objectUrl);
          setError(false);
        })
        .catch(() => {
          if (!ignore) {
            setView(undefined);
            setError(true);
          }
        });
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  if (!view)
    return error ? (
      <p>Diagrama inválido.</p>
    ) : (
      <pre>
        <code>{source}</code>
      </pre>
    );
  return <img src={view} alt="Diagrama Mermaid" style={{ maxWidth: "100%" }} />;
}

export function PrivateImage({
  url,
  token,
  text,
}: {
  url: string;
  token: string;
  text: string;
}) {
  const [view, setView] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let local = "";
    if (
      !/^\/v1\/wiki\/pages\/[a-f0-9-]{36}\/attachments\/[a-f0-9-]{36}$/i.test(
        url,
      )
    )
      return;
    void fetch(url, {
      headers: { Authorization: "Bearer " + token },
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        const file = (await response.json()) as {
          contentType: string;
          data: string;
        };
        if (
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            file.contentType,
          )
        )
          throw new Error("Invalid image");
        if (abort.signal.aborted) return;
        const bytes = Uint8Array.from(atob(file.data), (char) =>
          char.charCodeAt(0),
        );
        local = URL.createObjectURL(
          new Blob([bytes], { type: file.contentType }),
        );
        setView(local);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => {
      abort.abort();
      if (local) URL.revokeObjectURL(local);
    };
  }, [url, token]);
  if (view) return <img src={view} alt={text} style={{ maxWidth: "100%" }} />;
  if (error) return <p>Imagem privada indisponível.</p>;
  if (url.startsWith("https://"))
    return (
      <a href={url} rel="noreferrer noopener">
        Abrir imagem: {text}
      </a>
    );
  return <p>{text}</p>;
}
