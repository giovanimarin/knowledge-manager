import { parentPort, workerData } from "node:worker_threads";
import { extractText, getDocumentProxy } from "unpdf";

if (!parentPort) throw new Error("PDF parser requires a worker");
try {
  const document = await getDocumentProxy(
    new Uint8Array(workerData as Uint8Array),
    {
      disableFontFace: true,
      useSystemFonts: false,
    },
  );
  if (document.numPages > 100) throw new Error("Too many pages");
  const result = await extractText(document, { mergePages: true });
  const text = result.text.trim();
  if (text.length > 50000) throw new Error("Text too long");
  parentPort.postMessage({ text });
} catch {
  parentPort.postMessage({ error: true });
}
