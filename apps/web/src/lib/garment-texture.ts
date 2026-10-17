import type { TextureRequestResult, TextureStatus } from "@pitari/api";

export function textureRequestMessage(result: TextureRequestResult) {
  return result.status === "accepted"
    ? "テクスチャの生成を受け付けました。完成後、PC内に保存します。"
    : `${result.message}服の詳細から生成をやり直せます。`;
}

/** テクスチャの状態から、アバターの服に貼る画像のURLを決める。作り直しの間や失敗しても、前に作ったものがあれば貼る */
export function textureImageUrl(
  garmentId: string,
  status: TextureStatus,
): string | null {
  return "imageId" in status && status.imageId
    ? `/api/garments/${encodeURIComponent(garmentId)}/images/${encodeURIComponent(status.imageId)}`
    : null;
}
