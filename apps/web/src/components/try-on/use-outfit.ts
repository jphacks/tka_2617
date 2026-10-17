import type { GarmentView } from "@pitari/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  avatarUrl,
  readOutfit,
  saveOutfit,
  type OutfitSlot,
} from "@/lib/outfit";
import { requestJson } from "@/lib/request";
import { wornTop, wornTrousers, type WornResult } from "@/lib/worn-garment";

type Loaded = { garment: GarmentView } | { error: string };

/** 片側の服の状態。nullは指定なし */
type Slot<T> = WornResult<T> | "loading" | null;

function resolve<T>(
  id: string | null,
  loaded: Partial<Record<string, Loaded>>,
  toWorn: (garment: GarmentView) => WornResult<T>,
): Slot<T> {
  if (id === null) return null;
  const result = loaded[id];
  if (!result) return "loading";
  return "error" in result ? { problem: result.error } : toWorn(result.garment);
}

/** URL（?top=…&bottom=…）で指定された服をAPIから読み、着せる形にする */
export function useOutfit() {
  const outfit = readOutfit(useSearchParams());
  const router = useRouter();
  // 服のIDごとの読み込み結果。外した後に残った側を読み直さないよう、IDで覚えておく
  const [loaded, setLoaded] = useState<Partial<Record<string, Loaded>>>({});

  useEffect(() => {
    let active = true;
    for (const id of [outfit.top, outfit.bottom]) {
      if (id === null) continue;
      void requestJson<GarmentView>(`/api/garments/${encodeURIComponent(id)}`)
        .then(
          (garment): Loaded => ({ garment }),
          (failure: unknown): Loaded => ({
            error:
              failure instanceof Error
                ? failure.message
                : "服を読み込めませんでした",
          }),
        )
        .then((result) => {
          if (active) setLoaded((s) => ({ ...s, [id]: result }));
        });
    }
    return () => {
      active = false;
    };
  }, [outfit.top, outfit.bottom]);

  return {
    outfit,
    top: resolve(outfit.top, loaded, wornTop),
    bottom: resolve(outfit.bottom, loaded, wornTrousers),
    /** 片側の服を外す。URLを消すだけだと、次に服の詳細から押したときに覚えていた服が戻るので、保存も消す */
    takeOff: (slot: OutfitSlot) => {
      const next = { ...outfit, [slot]: null };
      saveOutfit(() => window.localStorage, next);
      router.replace(avatarUrl(next));
    },
  };
}
