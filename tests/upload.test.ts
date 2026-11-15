import test from "node:test";
import assert from "node:assert/strict";
import { imageBytes } from "../supabase/functions/_shared/image";
const body = (bytes: number[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(bytes));
      c.close();
    },
  });
test("Backend image guard accepts only permitted signatures", async () => {
  assert.equal(
    (await imageBytes(body([255, 216, 255, 1, 255, 217]))).mime,
    "image/jpeg",
  );
  assert.equal(
    (await imageBytes(body([137, 80, 78, 71, 13, 10, 26, 10, 0]))).mime,
    "image/png",
  );
  await assert.rejects(() =>
    imageBytes(body([...Buffer.from('<svg onload="alert(1)">')])),
  );
  await assert.rejects(() => imageBytes(body([])));
  await assert.rejects(() => imageBytes(null));
});
test("Backend byte limit counts actual streamed bytes", async () => {
  await assert.rejects(
    () => imageBytes(body([255, 216, 255, 1, 255, 217]), 5),
    /maximum/,
  );
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      c.enqueue(new Uint8Array(6));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => imageBytes(stream, 5));
  assert.equal(cancelled, true);
});
