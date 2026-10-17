import { z } from "zod";

const garmentId = z.uuid();

// 服の詳細から撮影画面の編集欄へ、その服のIDを渡す
export function editGarmentPath(id: string): string {
  return `/capture?edit=${encodeURIComponent(id)}`;
}

// URLの`edit`から、編集する服のIDを取り出す。無いか、服のIDの形でなければnull
export function editingGarmentId(
  value: string | string[] | undefined,
): string | null {
  const parsed = garmentId.safeParse(value);
  return parsed.success ? parsed.data : null;
}
