import type { MeasurementKey } from "@/lib/garment";
import type { TrouserKey } from "@/lib/trousers";

// 服の寸法をサイズキーへ渡す前に確かめる（docs/adr/0039-garment-size-limits.md）

/** その体型・身長の基準寸法に対して、この割合の外の値はモデルへ渡さない。人の服の寸法として明らかにおかしい値を止める */
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

type Range = readonly [number, number];

/** Blenderで形を確かめた、基準寸法からの差（cm）。assets/blender/verify_sizes.pyのOFFSETSとCASES */
export const TOP_VERIFIED: Record<MeasurementKey, Range> = {
  length: [-6, 10],
  width: [-16, 10],
  shoulder: [-4, 5],
  sleeve: [-5, 10],
};

/** ズボンはサイズキーの値で確かめた（verify_trousers.pyのKEY_SETS）。キー1.0がおよそ1cmなので、cmの差として使う */
export const TROUSER_VERIFIED: Record<TrouserKey, Range> = {
  waist: [-6, 10],
  hip: [-3, 8],
  thigh: [-1, 3],
  rise: [-2, 4],
  inseam: [-5, 8],
  hem: [-2, 6],
};

/** problemsにある項目はモデルへ渡さない。outsideの項目は渡すが、形がずれることがある */
export type SizeCheck<K extends string> = {
  problems: Partial<Record<K, string>>;
  outside: K[];
};

export function checkSizes<K extends string>(
  keys: readonly K[],
  input: Record<K, string>,
  base: Record<K, number>,
  verified: Record<K, Range>,
): SizeCheck<K> {
  const problems: Partial<Record<K, string>> = {};
  const outside: K[] = [];
  for (const k of keys) {
    const value = Number(input[k]);
    if (input[k].trim() === "" || !Number.isFinite(value) || value <= 0) {
      problems[k] = "0より大きい数を入れてください";
      continue;
    }
    const min = Math.ceil(base[k] * MIN_RATIO);
    const max = Math.floor(base[k] * MAX_RATIO);
    if (value < min || value > max) {
      problems[k] = `${String(min)}〜${String(max)}cmで入れてください`;
      continue;
    }
    const diff = value - base[k];
    if (diff < verified[k][0] || diff > verified[k][1]) outside.push(k);
  }
  return { problems, outside };
}
