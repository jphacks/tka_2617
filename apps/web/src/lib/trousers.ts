import { z } from "zod";
import { BUILDS, type Build } from "@/lib/avatar-settings";
import {
  heightBlend,
  solveLinear,
  type FitStatus,
  type GarmentSize,
} from "@/lib/garment";

/* ---------------------------------------------------------------- 3D側の寸法 */

/** ズボンの入力6項目（cm）。サイズキーsize_* と1対1。測り方はassets/blender/pitari_trousers.py */
export const TROUSER_KEYS = [
  "waist",
  "hip",
  "thigh",
  "rise",
  "inseam",
  "hem",
] as const;
export type TrouserKey = (typeof TROUSER_KEYS)[number];

export const TROUSER_LABELS: Record<TrouserKey, string> = {
  waist: "ウエスト",
  hip: "ヒップ",
  thigh: "わたり幅",
  rise: "股上",
  inseam: "股下",
  hem: "裾幅",
};

export const TrouserMeasurementsSchema = z.object({
  waist: z.number(), // ウエストの上端の一周
  hip: z.number(), // 股の2cm上で切った一周
  thigh: z.number(), // 股の1cm下で片脚を切った一周÷2
  rise: z.number(), // 前のウエストの中心から股まで
  inseam: z.number(), // 股から裾の内側までの直線距離
  hem: z.number(), // 裾の一周÷2
});
export type TrouserMeasurements = z.infer<typeof TrouserMeasurementsSchema>;

/** 服データ（trousers）からズボンの6項目を取り出す */
export function trouserMeasurements(g: GarmentSize): TrouserMeasurements {
  if (g.category !== "trousers")
    throw new Error(`ズボンではありません: ${g.category}`);
  const m = g.measurements;
  return TrouserMeasurementsSchema.parse({
    waist: m.waistCm,
    hip: m.hipCm,
    thigh: m.thighWidthCm,
    rise: m.riseCm,
    inseam: m.inseamCm,
    hem: m.hemWidthCm,
  });
}

/* ---------------------------------------------------------------- 基準寸法とキーの効き方 */

/** 着られるかを決める寸法。長さ（股上・股下）と裾幅は、着られるかに関わらない */
const FIT_KEYS = ["waist", "hip", "thigh"] as const;

const TrouserMatrixSchema = z
  .array(z.array(z.number()).length(TROUSER_KEYS.length))
  .length(TROUSER_KEYS.length);

/**
 * trousers_male_height.json：標準の身長と、体型・身長ごとの基準寸法、size_* キーの効き方M、体の寸法。
 * Mの行 = parts、列 = partsの順のsize_* キー。体の寸法は、ズボンと同じ高さで体を切った周囲（cm）。
 * 太ももは片脚の一周÷2で、わたり幅と同じ数え方。身長は昇順
 */
export const TrouserTableSchema = z.object({
  standard_cm: z.number(),
  parts: z.array(z.enum(TROUSER_KEYS)).length(TROUSER_KEYS.length),
  builds: z.record(
    z.enum(BUILDS),
    z
      .array(
        z.object({
          height_cm: z.number(),
          body: z.object({
            waist: z.number(),
            hip: z.number(),
            thigh: z.number(),
          }),
          base: TrouserMeasurementsSchema,
          m: TrouserMatrixSchema,
        }),
      )
      .min(2),
  ),
});
export type TrouserTable = z.infer<typeof TrouserTableSchema>;

export type TrouserFit = {
  base: TrouserMeasurements;
  m: number[][];
  body: Record<(typeof FIT_KEYS)[number], number>;
};

/** 前後の身長の基準寸法・M・体の寸法を直線で補間する（範囲の外は端の値） */
export function trouserFitAt(
  build: Build,
  heightCm: number,
  table: TrouserTable,
): TrouserFit {
  const { lo, hi, mix } = heightBlend(table.builds[build], heightCm);
  return {
    base: Object.fromEntries(
      TROUSER_KEYS.map((p) => [p, mix(lo.base[p], hi.base[p])]),
    ) as TrouserMeasurements,
    m: lo.m.map((row, r) => row.map((v, c) => mix(v, hi.m[r][c]))),
    body: {
      waist: mix(lo.body.waist, hi.body.waist),
      hip: mix(lo.body.hip, hi.body.hip),
      thigh: mix(lo.body.thigh, hi.body.thigh),
    },
  };
}

/* ---------------------------------------------------------------- サイズキー */

// ヒップとわたり幅はほぼ同じ高さを測るので強く連動し、写真の寸法どうしが矛盾することがある。
// Mをそのまま解くとキーの値が数十にもなって形が崩れるので、キーの値をこの強さで抑える。
// Blenderの検証（verify_trousers.py の RIDGE）と同じ値にする
const RIDGE = 0.01;

/**
 * 実寸6項目からsize_* キーの値（1.0 = +1cm）を決める。
 * (MᵀM + λI) × キー = Mᵀ × (実寸 − その体型・身長の基準寸法) を解く
 */
export function trouserKeyValues(
  target: TrouserMeasurements,
  fit: TrouserFit,
  table: TrouserTable,
): Record<string, number> {
  const m = TROUSER_KEYS.map((p) => fit.m[table.parts.indexOf(p)]);
  const diff = TROUSER_KEYS.map((p) => target[p] - fit.base[p]);
  const n = table.parts.length;
  const a = Array.from({ length: n }, (_, i) =>
    Array.from(
      { length: n },
      (_, j) =>
        m.reduce((sum, row) => sum + row[i] * row[j], 0) +
        (i === j ? RIDGE : 0),
    ),
  );
  const b = Array.from({ length: n }, (_, i) =>
    m.reduce((sum, row, r) => sum + row[i] * diff[r], 0),
  );
  const k = solveLinear(a, b);
  return Object.fromEntries(table.parts.map((p, i) => [`size_${p}`, k[i]]));
}

/* ---------------------------------------------------------------- 着られるか */

/** デニムはほとんど伸びない。体の寸法よりこの割合を超えて小さいズボンは、着られないとみなす */
export const TROUSER_STRETCH_RATIO = 0.05;

/**
 * ズボンがその体に着られるか。ウエスト・ヒップ・わたり幅のうち、一番きつい寸法で決める。
 * 大きい側は判定しない（ウエストはベルトで留められるため）
 */
export function trouserFitStatus(
  target: TrouserMeasurements,
  fit: TrouserFit,
): FitStatus {
  const ratio = Math.min(...FIT_KEYS.map((k) => target[k] / fit.body[k]));
  if (ratio >= 1) return "fits";
  if (ratio >= 1 - TROUSER_STRETCH_RATIO) return "tight";
  return "tooSmall";
}
