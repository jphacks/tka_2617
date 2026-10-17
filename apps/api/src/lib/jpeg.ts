import { HttpError } from "#src/lib/http-error";

export async function readJpeg(file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new HttpError(413, "画像は8MiB以下にしてください");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new HttpError(400, "JPEG画像を選んでください");
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 218 || marker === 217) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      const heightPx = bytes.readUInt16BE(offset + 5);
      const widthPx = bytes.readUInt16BE(offset + 7);
      if (
        widthPx < 1 ||
        heightPx < 1 ||
        widthPx > 4096 ||
        heightPx > 4096 ||
        widthPx * heightPx > 12_000_000
      )
        break;
      return { bytes, widthPx, heightPx };
    }
    offset += length + 2;
  }
  throw new HttpError(400, "画像の形式またはサイズを確認してください");
}
