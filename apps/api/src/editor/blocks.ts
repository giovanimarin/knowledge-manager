import * as Y from "yjs";
import { IdentityError, id, input } from "../identity/security.js";

export const kinds = [
  "text",
  "heading",
  "list",
  "checklist",
  "table",
  "code",
  "image",
  "link",
  "mermaid",
  "callout",
] as const;
type Kind = (typeof kinds)[number];
export type Block = {
  id: string;
  kind: Kind;
  text: string;
  checked?: boolean;
  url?: string;
};
const invalid = () => new IdentityError(400);
export function validateBlocks(value: unknown): Block[] {
  if (!Array.isArray(value) || value.length > 300) throw invalid();
  let size = 0;
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    const row = input(entry);
    const key = id(row.id);
    const kind = row.kind === undefined ? "text" : (row.kind as Kind);
    if (
      ids.has(key) ||
      !kinds.includes(kind) ||
      typeof row.text !== "string" ||
      row.text.includes("\0")
    )
      throw invalid();
    ids.add(key);
    size += row.text.length + (ids.size > 1 ? 1 : 0);
    if (size > 50000) throw invalid();
    const result: Block = { id: key, kind, text: row.text };
    if (row.checked !== undefined) {
      if (kind !== "checklist" || typeof row.checked !== "boolean")
        throw invalid();
      result.checked = row.checked;
    }
    if (row.url !== undefined) {
      if (
        (kind !== "link" && kind !== "image") ||
        typeof row.url !== "string" ||
        row.url.length > 2048
      )
        throw invalid();
      try {
        const localImage =
          kind === "image" &&
          /^\/v1\/wiki\/pages\/[a-f0-9-]{36}\/attachments\/[a-f0-9-]{36}$/i.test(
            row.url,
          );
        const url = localImage
          ? new URL(row.url, "https://knowledge.invalid")
          : new URL(row.url);
        if (url.protocol !== "https:" || url.username || url.password)
          throw invalid();
      } catch {
        throw invalid();
      }
      result.url = row.url;
    }
    return result;
  });
}

export function initDocument(blocks: Block[]) {
  const doc = new Y.Doc();
  const array = doc.getArray<Y.Map<unknown>>("blocks");
  doc.transact(() => {
    array.push(
      blocks.map((block) => {
        const entry = new Y.Map<unknown>();
        entry.set("id", block.id);
        entry.set("kind", block.kind);
        entry.set("text", new Y.Text(block.text));
        if (block.checked !== undefined) entry.set("checked", block.checked);
        if (block.url !== undefined) entry.set("url", block.url);
        return entry;
      }),
    );
  });
  return doc;
}

export function project(doc: Y.Doc) {
  if (
    doc.store.pendingStructs ||
    doc.store.pendingDs ||
    [...doc.share.keys()].some((key) => key !== "blocks")
  )
    throw invalid();
  return validateBlocks(
    doc
      .getArray<Y.Map<unknown>>("blocks")
      .toArray()
      .map((block) => {
        if (!(block instanceof Y.Map) || !(block.get("text") instanceof Y.Text))
          throw invalid();
        if (
          [...block.keys()].some(
            (key) => !["id", "kind", "text", "checked", "url"].includes(key),
          )
        )
          throw invalid();
        return block.toJSON();
      }),
  );
}
