import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  attachmentInput,
  scanAttachment,
} from "../apps/api/dist/wiki/attachments.js";

const sample = {
  filename: "fixture.txt",
  contentType: "text/plain",
  data: "dGVzdGUK",
};

test("wiki attachments validate actual bytes and reject unsafe filenames and MIME mismatches", () => {
  assert.equal(attachmentInput(sample).bytes.toString(), "teste\n");
  for (const invalid of [
    { ...sample, filename: "../fixture.txt" },
    { ...sample, filename: "fixture.pdf", contentType: "application/pdf" },
    { ...sample, filename: "fixture.exe" },
    { ...sample, data: "dGVzdGUK===" },
    { ...sample, data: "AA==" },
  ])
    assert.throws(() => attachmentInput(invalid), { status: 400 });
});

test("wiki ClamAV protocol requires an explicit complete verdict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "km-clamd-"));
  const sock = join(dir, "scan.sock");
  const bytes = attachmentInput(sample).bytes;
  let response = "stream: OK\0";
  let stream;
  const server = createServer((socket) =>
    socket.once("data", (data) => {
      stream = data;
      socket.end(response);
    }),
  );
  try {
    await new Promise((resolve) => server.listen(sock, resolve));
    assert.equal(await scanAttachment(bytes, sock), "clean");
    assert.equal(stream.subarray(0, 10).toString(), "zINSTREAM\0");
    assert.equal(stream.readUInt32BE(10), bytes.length);
    assert.deepEqual(stream.subarray(14, -4), bytes);
    response = "stream: Synthetic-Test FOUND\0";
    assert.equal(await scanAttachment(bytes, sock), "rejected");
    response = "stream: ERROR\0";
    assert.equal(await scanAttachment(bytes, sock), "pending");
    assert.equal(
      await scanAttachment(bytes, join(dir, "missing.sock")),
      "pending",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
