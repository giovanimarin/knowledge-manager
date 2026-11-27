import { Diagram, PrivateImage } from "./editor-visuals";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import * as Y from "yjs";
import { EditorHistory } from "./editor-history";

const options = {
  text: "Texto",
  heading: "Título",
  list: "Lista",
  checklist: "Checklist",
  table: "Tabela",
  code: "Código",
  image: "Imagem",
  link: "Link",
  mermaid: "Mermaid",
  callout: "Destaque",
};
type Kind = keyof typeof options;
type Block = {
  id: string;
  kind: Kind;
  text: string;
  checked?: boolean;
  url?: string;
};
type Participant = {
  id: string;
  cursor: { blockId: string; offset: number } | null;
};
type Packet = { operationId: string; update: string };
type Status = "connecting" | "online" | "offline" | "denied";
const base64 = (bytes: Uint8Array) => {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(""));
};
const decode = (data: string) =>
  Uint8Array.from(atob(data), (character) => character.charCodeAt(0));

function textChanges(text: Y.Text, value: string) {
  const old = text.toString();
  let prefix = 0,
    suffix = 0;
  while (
    prefix < Math.min(old.length, value.length) &&
    old[prefix] === value[prefix]
  )
    prefix++;
  while (
    suffix < Math.min(old.length, value.length) - prefix &&
    old[old.length - 1 - suffix] === value[value.length - 1 - suffix]
  )
    suffix++;
  if (old.length - prefix - suffix)
    text.delete(prefix, old.length - prefix - suffix);
  if (value.length - prefix - suffix)
    text.insert(prefix, value.slice(prefix, value.length - suffix));
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
        .map((part, index) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={index}>{part.slice(2, -2)}</strong>
          ) : part.startsWith("*") && part.endsWith("*") ? (
            <em key={index}>{part.slice(1, -1)}</em>
          ) : part.startsWith("`") && part.endsWith("`") ? (
            <code key={index}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}

function Preview({ block, token }: { block: Block; token: string }) {
  const url = block.url?.startsWith("https://") ? block.url : undefined;
  if (block.kind === "heading") return <h4>{block.text}</h4>;
  if (block.kind === "list")
    return (
      <ul>
        {block.text.split("\n").map((line, index) => (
          <li key={index}>
            <Inline text={line} />
          </li>
        ))}
      </ul>
    );
  if (block.kind === "table")
    return (
      <table>
        <tbody>
          {block.text.split("\n").map((line, index) => (
            <tr key={index}>
              {line.split("|").map((cell, column) => (
                <td key={column}>
                  <Inline text={cell.trim()} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (block.kind === "checklist")
    return (
      <p>
        {block.checked ? "☑" : "☐"} <Inline text={block.text} />
      </p>
    );
  if (block.kind === "link" && url)
    return (
      <p>
        <a href={url} rel="noreferrer noopener">
          <Inline text={block.text} />
        </a>
      </p>
    );
  if (block.kind === "image")
    return block.url ? (
      <PrivateImage
        key={block.url}
        url={block.url}
        text={block.text}
        token={token}
      />
    ) : (
      <p>{block.text}</p>
    );
  if (block.kind === "mermaid")
    return <Diagram key={block.text} source={block.text} />;
  if (block.kind === "code")
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  if (block.kind === "callout")
    return (
      <blockquote>
        <Inline text={block.text} />
      </blockquote>
    );
  return (
    <p>
      <Inline text={block.text} />
    </p>
  );
}

export function CollaborativeEditor({
  pageId,
  spaceId,
  token,
}: {
  pageId: string;
  spaceId: string | null;
  token: string;
}) {
  const session = useRef<{
    doc: Y.Doc;
    socket: WebSocket | undefined;
    generation: string;
    send: (type: string, body: unknown) => void;
  } | null>(null);
  const focused = useRef<HTMLTextAreaElement | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [writable, setWritable] = useState(false);
  const [dirty, setDirty] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [peers, setPeers] = useState<Participant[]>([]);
  const [kind, setKind] = useState<Kind>("text");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Packet[] = [];
    let sent = false;
    let allowed = false;
    const ref = {
      doc: new Y.Doc(),
      socket: undefined as WebSocket | undefined,
      generation: "",
      send(type: string, body: unknown) {
        if (ref.socket?.readyState === WebSocket.OPEN)
          ref.socket.send(JSON.stringify({ type, ...(body as object) }));
      },
    };
    session.current = ref;
    function flush() {
      const next = pending[0];
      if (
        !allowed ||
        sent ||
        !next ||
        ref.socket?.readyState !== WebSocket.OPEN
      )
        return;
      sent = true;
      ref.send("update", { ...next, generation: ref.generation });
    }
    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        protocol + "//" + window.location.host + "/v1/collaboration/" + pageId,
      );
      ref.socket = socket;
      sent = false;
      allowed = false;
      setStatus("connecting");
      socket.onopen = () => ref.send("auth", { token });
      socket.onmessage = (event: MessageEvent<string>) => {
        const packet = JSON.parse(event.data) as {
          type: string;
          snapshot: string;
          generation: string;
          sequence: number;
          write: boolean;
          operationId: string;
          participants: Participant[];
          status: number;
        };
        if (packet.type === "sync") {
          if (packet.generation !== ref.generation) {
            if (ref.generation && pending.length)
              setMessage(
                "O documento mudou fora da sessão. Alterações locais pendentes precisam ser refeitas.",
              );
            pending = [];
            setDirty(0);
            ref.doc.destroy();
            ref.doc = new Y.Doc();
            ref.doc.on("update", collect);
            ref.generation = packet.generation;
          }
          Y.applyUpdate(ref.doc, decode(packet.snapshot), "server");
          setBlocks(
            ref.doc
              .getArray<Y.Map<unknown>>("blocks")
              .toArray()
              .map((block) => block.toJSON() as Block),
          );
          setSequence(packet.sequence);
          setWritable(packet.write);
          setStatus("online");
          allowed = packet.write;
          flush();
        }
        if (packet.type === "ack") {
          pending = pending.filter(
            (item) => item.operationId !== packet.operationId,
          );
          sent = false;
          flush();
          setDirty(pending.length);
          setSequence((previous) => Math.max(previous, packet.sequence));
        }
        if (packet.type === "presence") setPeers(packet.participants);
        if (packet.type === "error") {
          pending = [];
          setDirty(0);
          setMessage(
            packet.status === 409
              ? "Revisão alterada. O editor vai sincronizar novamente."
              : "A alteração foi rejeitada pelo servidor.",
          );
          ref.doc.destroy();
          ref.doc = new Y.Doc();
          ref.doc.on("update", collect);
          ref.generation = "";
          socket.close();
        }
      };
      socket.onclose = (event) => {
        if (disposed) return;
        setPeers([]);
        setWritable(false);
        if ([4401, 4403].includes(event.code)) {
          pending = [];
          setDirty(0);
          setStatus("denied");
          setBlocks([]);
          ref.doc.destroy();
          ref.doc = new Y.Doc();
          ref.doc.on("update", collect);
          return;
        }
        setStatus("offline");
        timer = setTimeout(connect, 700);
      };
    }
    function collect(update: Uint8Array, origin: unknown) {
      if (origin !== "local") return;
      const packet = {
        operationId: crypto.randomUUID(),
        update: base64(update),
      };
      pending.push(packet);
      setDirty(pending.length);
      flush();
      setBlocks(
        ref.doc
          .getArray<Y.Map<unknown>>("blocks")
          .toArray()
          .map((block) => block.toJSON() as Block),
      );
    }
    ref.doc.on("update", collect);
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ref.socket?.close();
      ref.doc.destroy();
      session.current = null;
    };
  }, [pageId, token]);

  function change(action: (array: Y.Array<Y.Map<unknown>>) => void) {
    const ref = session.current;
    if (!ref || !writable || status !== "online") return;
    ref.doc.transact(() => action(ref.doc.getArray("blocks")), "local");
  }
  function create() {
    change((array) => {
      const block = new Y.Map<unknown>();
      block.set("id", crypto.randomUUID());
      block.set("kind", kind);
      block.set("text", new Y.Text());
      if (kind === "checklist") block.set("checked", false);
      array.push([block]);
    });
  }
  function edit(index: number, event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    change((array) => {
      const block = array.get(index);
      const text = block.get("text") as Y.Text;
      const prefixes = [
        ["# ", "heading"],
        ["- [ ] ", "checklist"],
        ["- ", "list"],
        ["> ", "callout"],
      ] as const;
      const shortcut = prefixes.find(([prefix]) => value.startsWith(prefix));
      if (shortcut && block.get("kind") === "text") {
        block.set("kind", shortcut[1]);
        textChanges(text, value.slice(shortcut[0].length));
      } else if (
        value.startsWith("/") &&
        value.endsWith(" ") &&
        Object.hasOwn(options, value.slice(1, -1))
      ) {
        block.set("kind", value.slice(1, -1));
        textChanges(text, "");
      } else textChanges(text, value);
    });
  }
  function mark(marker: string) {
    const field = focused.current;
    if (!field) return;
    const index = Number(field.dataset.blockIndex);
    const { selectionStart: start, selectionEnd: end, value } = field;
    if (start === end) return;
    change((array) =>
      textChanges(
        array.get(index).get("text") as Y.Text,
        value.slice(0, start) +
          marker +
          value.slice(start, end) +
          marker +
          value.slice(end),
      ),
    );
  }

  return (
    <section aria-label="Editor colaborativo">
      <h4>Editor colaborativo</h4>
      <p role="status">
        {status === "online"
          ? dirty
            ? "Salvando…"
            : "Alterações salvas"
          : status === "denied"
            ? "Acesso ao editor revogado"
            : status === "offline"
              ? "Reconectando ao editor…"
              : "Conectando ao editor…"}
      </p>
      {message && <p role="alert">{message}</p>}
      {status === "online" && (
        <>
          <p>{peers.length} pessoa(s) na sessão</p>
          <div aria-label="Formatação">
            <button
              type="button"
              disabled={!writable}
              onClick={() => mark("**")}
            >
              Negrito
            </button>
            <button
              type="button"
              disabled={!writable}
              onClick={() => mark("*")}
            >
              Itálico
            </button>
            <button
              type="button"
              disabled={!writable}
              onClick={() => mark("`")}
            >
              Código inline
            </button>
          </div>
          <label>
            Tipo do novo bloco{" "}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as Kind)}
            >
              {Object.entries(options).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!writable} onClick={create}>
            Adicionar bloco
          </button>
          <p>
            Use atalhos Markdown ou digite / seguido do tipo de bloco e um
            espaço.
          </p>
          <ol>
            {blocks.map((block, index) => (
              <li key={block.id}>
                <Preview block={block} token={token} />
                <label>
                  {options[block.kind]} {index + 1}
                  <textarea
                    data-block-index={index}
                    value={block.text}
                    disabled={!writable}
                    onFocus={(event) => {
                      focused.current = event.currentTarget;
                    }}
                    onChange={(event) => edit(index, event)}
                    onSelect={(event) =>
                      session.current?.send("cursor", {
                        blockId: block.id,
                        offset: event.currentTarget.selectionStart,
                      })
                    }
                  />
                </label>
                {block.kind === "checklist" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={!!block.checked}
                      disabled={!writable}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        change((array) =>
                          array.get(index).set("checked", checked),
                        );
                      }}
                    />
                    Concluído
                  </label>
                )}
                {(block.kind === "image" || block.kind === "link") && (
                  <label>
                    URL HTTPS ou URL do anexo privado{" "}
                    <input
                      type="text"
                      defaultValue={block.url ?? ""}
                      disabled={!writable}
                      onBlur={(event) => {
                        const url = event.currentTarget.value;
                        change((array) => {
                          const field = array.get(index);
                          if (url) field.set("url", url);
                          else field.delete("url");
                        });
                      }}
                    />
                  </label>
                )}
                {peers
                  .filter((peer) => peer.cursor?.blockId === block.id)
                  .map((peer) => (
                    <small key={peer.id}>
                      {" "}
                      Cursor na posição {peer.cursor?.offset}
                    </small>
                  ))}
                <button
                  type="button"
                  disabled={!writable}
                  onClick={() => change((array) => array.delete(index, 1))}
                >
                  Excluir bloco {index + 1}
                </button>
              </li>
            ))}
          </ol>
          <EditorHistory
            pageId={pageId}
            spaceId={spaceId}
            token={token}
            sequence={sequence}
          />
        </>
      )}
    </section>
  );
}
