import { randomUUID } from "node:crypto";
import type { Dependencies } from "@km/foundation";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { Sessions } from "../identity/sessions.js";
import { IdentityError, input, id, string } from "../identity/security.js";
import { EditorStore } from "./store.js";

const path = /^\/v1\/collaboration\/([a-f0-9-]{36})$/i;
type Cursor = { blockId: string; offset: number };
type Participant = { id: string; cursor: Cursor | null };
type Connection = {
  tenant: string;
  page: string;
  member: string;
  cursor: Cursor | null;
};

export function installCollaboration(
  server: Server,
  sessions: Sessions,
  dependencies: Dependencies,
) {
  const sockets = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 200 * 1024,
  });
  const peers = new Map<WebSocket, Connection>();
  server.on("upgrade", (req, socket, head) => {
    const match = path.exec(req.url ?? "");
    if (!match || sockets.clients.size >= 256) {
      socket.destroy();
      return;
    }
    let page: string;
    try {
      page = id(match[1]);
    } catch {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => attach(ws, page));
  });

  function attach(ws: WebSocket, page: string) {
    ws.on("error", () => ws.terminate());
    let token: string | undefined;
    let sequence = -1;
    let generation = "";
    let presence = "";
    const connection = randomUUID();
    let editable: boolean | undefined;
    let policyEpoch = "";
    let busy = false;
    let queued = 0;
    let queue = Promise.resolve();
    let deadline = 0;
    const authTimer = setTimeout(
      () => ws.close(4401, "Authentication required"),
      4000,
    );
    const send = (value: unknown) => {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1024 * 1024)
        ws.send(JSON.stringify(value));
      else if (ws.readyState === WebSocket.OPEN) ws.close(1013, "Backpressure");
    };
    const attempt = async <T>(
      operation: (store: EditorStore) => Promise<T>,
      touch = true,
    ) => {
      if (!token) throw new IdentityError(401);
      return sessions.withActor(
        "Bearer " + token,
        (tx, tenant, actor) => operation(new EditorStore(tx, tenant, actor)),
        touch,
      );
    };
    const deny = (error: unknown) => {
      if (
        error instanceof IdentityError &&
        [401, 403, 404].includes(error.status)
      ) {
        ws.close(error.status === 401 ? 4401 : 4403, "Access unavailable");
        return;
      }
      if (error instanceof IdentityError) {
        send({ type: "error", status: error.status });
        return;
      }
      ws.close(1011, "Collaboration unavailable");
    };
    const poll = async () => {
      const result = await attempt((store) => store.sync(page), false);
      const previous = peers.get(ws);
      peers.set(ws, {
        tenant: result.tenant,
        page,
        member: result.member,
        cursor: previous?.cursor ?? null,
      });
      const { snapshot, write, epoch } = result;
      if (
        sequence !== result.sequence ||
        generation !== result.generation ||
        editable !== write ||
        policyEpoch !== epoch
      ) {
        editable = write;
        policyEpoch = epoch;
        sequence = result.sequence;
        generation = result.generation;
        send({ type: "sync", snapshot, sequence, generation, write, epoch });
      }
      const participants = new Map<string, Participant>();
      const entries = await dependencies.updatePresence(
        result.tenant,
        page,
        connection,
        JSON.stringify({ id: result.member, cursor: previous?.cursor ?? null }),
      );
      for (const raw of entries) {
        const peer = JSON.parse(raw) as Participant;
        participants.set(peer.id, peer);
      }
      const next = JSON.stringify([...participants.values()]);
      if (presence !== next) {
        presence = next;
        send({ type: "presence", participants: [...participants.values()] });
      }
    };
    const timer = setInterval(() => {
      if (!token || busy || queued || ws.readyState !== WebSocket.OPEN) return;
      busy = true;
      void poll()
        .catch(deny)
        .finally(() => {
          busy = false;
        });
    }, 650);
    ws.on("close", () => {
      clearTimeout(authTimer);
      clearInterval(timer);
      const peer = peers.get(ws);
      peers.delete(ws);
      if (peer)
        void dependencies
          .removePresence(peer.tenant, peer.page, connection)
          .catch(() => {});
    });
    ws.on("message", (raw, isBinary) => {
      if (++queued > 16) {
        ws.close(1008, "Too many messages");
        return;
      }
      queue = queue
        .then(async () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (isBinary) throw new IdentityError(400);
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw.toString());
          } catch {
            throw new IdentityError(400);
          }
          const packet = input(parsed);
          if (!token) {
            if (packet.type !== "auth") throw new IdentityError(401);
            token = string(packet.token, 180);
            await poll();
            clearTimeout(authTimer);
            return;
          }
          if (packet.type === "update") {
            const receipt = await attempt((store) =>
              store.update(page, packet),
            );
            send({ type: "ack", ...receipt });
            await poll();
            return;
          }
          if (packet.type === "cursor") {
            if (Date.now() < deadline) return;
            deadline = Date.now() + 100;
            await poll();
            const current = peers.get(ws);
            if (!current) return;
            const offset = packet.offset;
            if (
              typeof offset !== "number" ||
              !Number.isInteger(offset) ||
              offset < 0 ||
              offset > 50000
            )
              throw new IdentityError(400);
            current.cursor = { blockId: id(packet.blockId), offset };
            return;
          }
          throw new IdentityError(400);
        })
        .catch(deny)
        .finally(() => {
          queued--;
        });
    });
  }
  return () => {
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
  };
}
