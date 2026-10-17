import type { TextureStatus } from "@pitari/api";
import { useEffect, useState } from "react";
import { textureImageUrl } from "@/lib/garment-texture";
import { requestJson } from "@/lib/request";

const POLL_MS = 5_000;
const READ_TIMEOUT_MS = 15_000;

/**
 * 服のテクスチャの画像のURL。作成中は数秒おきに聞き直し、完成したら新しいURLを返す。
 * まだ無い・作れなかったときと、最初から聞けないときはnullで、服は材質の色のまま出す。
 * 一度画像のURLを返した後に聞き直せなかったときは、そのURLを返し続ける
 */
export function useGarmentTexture(garmentId: string | null): string | null {
  const [found, setFound] = useState<{
    garmentId: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (garmentId === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      requestJson<TextureStatus>(
        `/api/garments/${encodeURIComponent(garmentId)}/texture`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(READ_TIMEOUT_MS),
          ]),
        },
      )
        .then((status) => {
          if (controller.signal.aborted) return;
          setFound({ garmentId, url: textureImageUrl(garmentId, status) });
          if (status.status === "processing")
            timer = setTimeout(check, POLL_MS);
        })
        .catch(() => {
          // 前に返した画像はStorageに保存済みで、聞けなくても使えるので、消さずに残す。
          // 聞けないまま聞き直しても同じなので、聞き直さない
        });
    };
    check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [garmentId]);

  return found?.garmentId === garmentId ? found.url : null;
}
