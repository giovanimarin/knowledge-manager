const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const {
  Queue,
  QueueEvents,
  Dependencies,
  queueName,
  probeName,
  redisOptions,
} = require("./api/node_modules/@km/foundation");

async function main() {
  const connection = redisOptions();
  const queue = new Queue(queueName, { connection });
  const events = new QueueEvents(queueName, { connection });
  const dependencies = new Dependencies();
  const id = randomUUID();
  const bytes = Buffer.from("KnowledgeManager synthetic backup fixture\n");
  try {
    await events.waitUntilReady();
    for (let attempt = 0; attempt < 2; attempt++) {
      const job = await queue.add(
        probeName,
        { id },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 250 },
          removeOnComplete: true,
        },
      );
      assert.equal(await job.waitUntilFinished(events, 12000), "recorded");
    }
    const invalid = await queue.add(
      probeName,
      { id: "invalid" },
      { attempts: 3, removeOnFail: 100 },
    );
    await assert.rejects(
      invalid.waitUntilFinished(events, 10000),
      /Invalid probe payload/,
    );
    assert.equal(
      (
        await dependencies.database
          .selectFrom("km.probe_receipts")
          .select("id")
          .where("id", "=", id)
          .execute()
      ).length,
      1,
    );
    await dependencies.storage.put(id, bytes);
    assert.deepEqual(await dependencies.storage.get(id), bytes);
    console.log(`${id}|${createHash("sha256").update(bytes).digest("hex")}`);
  } finally {
    await Promise.all([queue.close(), events.close(), dependencies.close()]);
  }
}

main().catch(() => {
  console.error("Foundation queue/storage probe failed");
  process.exitCode = 1;
});
