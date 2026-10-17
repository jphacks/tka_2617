import type { TextureRequestResult } from "@pitari/api";

export function textureRequestMessage(result: TextureRequestResult) {
  return result.status === "accepted"
    ? "テクスチャの生成を受け付けました。完成後、PC内に保存します。"
    : `${result.message}裏面を撮り直すと、もう一度依頼します。`;
}
