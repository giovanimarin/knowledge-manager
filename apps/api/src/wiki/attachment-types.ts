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

export const mimeForFilename = (name: string) =>
  formats.get(name.split(".").at(-1)?.toLowerCase() ?? "");
