import { parentPort, workerData } from "node:worker_threads";
import { extractText, getDocumentProxy } from "unpdf";

if (!parentPort) throw new Error("PDF parser requires a worker");
try {
  const document = await getDocumentProxy(
    new Uint8Array(workerData as Uint8Array),
    { disableFontFace: true, useSystemFonts: false },
  );
  if (document.numPages > 100) throw new Error("PDF pages exceed bounds");
  const result = await extractText(document, { mergePages: true });
  parentPort.postMessage({ text: result.text });
} catch {
  parentPort.postMessage({ error: true });
}
