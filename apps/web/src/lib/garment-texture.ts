import type { TextureRequestResult } from "@pitari/api";

export function textureRequestMessage(result: TextureRequestResult) {
  return result.status === "accepted"
    ? "テクスチャの生成を受け付けました。完成後、PC内に保存します。"
    : `${result.message}服の詳細から生成をやり直せます。`;
}
