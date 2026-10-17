import type { TextureStatus } from "@pitari/api";
import { useEffect, useState } from "react";
import { textureImageUrl } from "@/lib/garment-texture";
import { requestJson } from "@/lib/request";

const POLL_MS = 5_000;
const READ_TIMEOUT_MS = 15_000;

/**
 * 服のテクスチャの画像のURL。作成中は数秒おきに聞き直し、完成したら新しいURLを返す。
 * 無い・失敗した・聞けない（推論サービスが止まっているなど）ときはnullで、服は今の色のまま出す
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
          // 聞けなくても服は着せられるので、今の色のまま出し、聞き直さない
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
