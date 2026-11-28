import { createHash } from "node:crypto";

export type Block = { id: string; kind?: string; text: string };
export const checksum = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function segments(
  title: string,
  blocks: Block[],
  width = 720,
  overlap = 96,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(overlap) ||
    width < 32 ||
    overlap < 0 ||
    overlap >= width
  )
    throw new Error("Invalid segmentation options");
  const output = [];
  let headings = [title.normalize("NFC")];
  for (const block of blocks) {
    const text = block.text
      .normalize("NFC")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
    const kind = block.kind ?? "text";
    if (kind === "heading") headings = [title.normalize("NFC"), text.trim()];
    const symbols = Array.from(text);
    let start = 0;
    while (start < symbols.length) {
      let end = Math.min(symbols.length, start + width);
      if (end < symbols.length) {
        const minimum = start + Math.max(Math.floor(width / 2), overlap + 1);
        for (let i = end - 1; i >= minimum; i--) {
          if (
            symbols[i] === "\n" ||
            (kind !== "table" && kind !== "code" && symbols[i] === " ")
          ) {
            end = i + 1;
            break;
          }
        }
      }
      const content = symbols.slice(start, end).join("");
      if (content.trim())
        output.push({
          id: checksum(block.id + ":" + start),
          blockId: block.id,
          content,
          kind,
          digest: checksum(content),
          heading: headings,
          start,
          end,
          ordinal: output.length,
        });
      if (end === symbols.length) break;
      start = end - overlap;
    }
  }
  return output;
}

// Offline lexical baseline. It is deterministic and uses no model or external API.
export function embed(text: string) {
  const values = Array<number>(64).fill(0);
  for (const word of text
    .toLowerCase()
    .normalize("NFC")
    .match(/[\p{L}\p{N}]+/gu) ?? []) {
    const hash = createHash("sha256").update(word).digest();
    const bucket = hash[0]! % values.length;
    values[bucket] = values[bucket]! + (hash[1]! & 1 ? 1 : -1);
  }
  const norm = Math.hypot(...values);
  return norm ? values.map((value) => value / norm) : values;
}
