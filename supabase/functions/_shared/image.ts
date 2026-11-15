export async function imageBytes(
  body: ReadableStream<Uint8Array> | null,
  maximum = 5 * 1024 * 1024,
): Promise<{
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
}> {
  const reader = body?.getReader();
  if (!reader) throw Error("No image body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximum) {
      await reader.cancel();
      throw Error("Image exceeds the maximum size");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const png =
    bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpg =
    bytes.length > 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217;
  if (!png && !jpg)
    throw Error("Only JPEG and PNG image signatures are accepted");
  return {
    bytes,
    mime: png ? "image/png" : "image/jpeg",
    extension: png ? "png" : "jpg",
  };
}
