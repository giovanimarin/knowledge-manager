import { createConnection } from "node:net";
import { decodeFile } from "./conversions.js";
import { IdentityError, string } from "../identity/security.js";

const formats = new Map([
  ["pdf", "application/pdf"],
  [
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ["csv", "text/csv"],
  ["txt", "text/plain"],
  ["md", "text/markdown"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["mp4", "video/mp4"],
  ["zip", "application/zip"],
]);
const matches = (bytes: Buffer, prefix: string) =>
  bytes.subarray(0, prefix.length).equals(Buffer.from(prefix, "latin1"));

export function attachmentInput(body: Record<string, unknown>) {
  const filename = string(body.filename, 180);
  const type = string(body.contentType, 100);
  const bytes = decodeFile(body.data);
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  if (
    !bytes.length ||
    /[\\/]/.test(filename) ||
    [...filename].some((char) => char.charCodeAt(0) < 32) ||
    formats.get(extension) !== type
  )
    throw new IdentityError(400);
  let valid = true;
  if (type.startsWith("text/")) {
    try {
      valid = !new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .includes("\0");
    } catch {
      valid = false;
    }
  } else if (extension === "pdf") valid = matches(bytes, "%PDF-");
  else if (["docx", "xlsx", "pptx", "zip"].includes(extension))
    valid = matches(bytes, "PK\x03\x04") || matches(bytes, "PK\x05\x06");
  else if (extension === "png") valid = matches(bytes, "\x89PNG\r\n\x1a\n");
  else if (["jpg", "jpeg"].includes(extension))
    valid = matches(bytes, "\xff\xd8\xff");
  else if (extension === "gif")
    valid = matches(bytes, "GIF87a") || matches(bytes, "GIF89a");
  else if (extension === "webp" || extension === "wav")
    valid =
      matches(bytes, "RIFF") &&
      bytes.toString("ascii", 8, 12) ===
        (extension === "webp" ? "WEBP" : "WAVE");
  else if (extension === "mp4")
    valid = bytes.toString("ascii", 4, 8) === "ftyp";
  else if (extension === "mp3")
    valid =
      matches(bytes, "ID3") ||
      (bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
  if (!valid) throw new IdentityError(400);
  return { filename, type, bytes };
}

export type ScanResult = "pending" | "clean" | "rejected";

// A private ClamAV socket is configured by the operator. Missing or invalid
// verdicts leave the attachment quarantined. Nothing is sent to a hosted API.
export function scanAttachment(
  bytes: Buffer,
  socketPath = process.env.KM_CLAMD_SOCKET,
): Promise<ScanResult> {
  if (!socketPath) return Promise.resolve("pending");
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let reply = "";
    const complete = (result: ScanResult) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000, () => complete("pending"));
    socket.on("error", () => complete("pending"));
    socket.on("end", () => complete("pending"));
    socket.on("connect", () => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      socket.write(
        Buffer.concat([
          Buffer.from("zINSTREAM\0"),
          length,
          bytes,
          Buffer.alloc(4),
        ]),
      );
    });
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
      if (reply.length > 1024) complete("pending");
      if (!reply.endsWith("\0")) return;
      if (reply === "stream: OK\0") complete("clean");
      else if (reply.startsWith("stream: ") && reply.endsWith(" FOUND\0"))
        complete("rejected");
      else complete("pending");
    });
  });
}
