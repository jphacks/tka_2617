import { HttpError } from "#src/lib/http-error";

export async function readPng(file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new HttpError(413, "切り抜き画像は8MiB以下にしてください");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    bytes.length < 45 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes[24] !== 8 ||
    bytes[25] !== 6 ||
    bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND"
  )
    throw new HttpError(400, "切り抜き画像は透過PNGにしてください");
  const widthPx = bytes.readUInt32BE(16);
  const heightPx = bytes.readUInt32BE(20);
  let offset = 33;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (offset + length + 12 > bytes.length)
      throw new HttpError(400, "切り抜き画像が壊れています");
    if (type === "IDAT" && length > 0) hasImageData = true;
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!hasImageData || offset !== bytes.length)
    throw new HttpError(400, "切り抜き画像が壊れています");
  if (
    !widthPx ||
    !heightPx ||
    widthPx > 4096 ||
    heightPx > 4096 ||
    widthPx * heightPx > 12_000_000
  )
    throw new HttpError(400, "切り抜き画像のサイズを確認してください");
  return { bytes, widthPx, heightPx };
}
