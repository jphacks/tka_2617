import { z } from "zod";

/* ---------------------------------------------------------------- 服データ（チーム共通の形式・仮） */

const cm = z.number().nullable();

/** 服データの寸法。measure/ が写真からDeepFashion2の点で測った値（cm）。カテゴリに無い項目はnull */
export const GarmentMeasurementsSchema = z.object({
  shoulderWidthCm: cm, // 肩幅DF2 7→25
  sleeveLengthCm: cm, // 袖丈DF2 7→9
  bodyWidthCm: cm, // 身幅DF2 12→20（脇の下→脇の下）
  bodyLengthCm: cm, // 着丈DF2 1→16（後ろ襟ぐり中心→裾の中心）
  waistCm: cm,
  hipCm: cm,
  thighWidthCm: cm,
  riseCm: cm,
  inseamCm: cm,
  hemWidthCm: cm,
});

export const GarmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["short_sleeve_top", "trousers"]),
  measurements: GarmentMeasurementsSchema,
  measurementVersion: z.string(),
});
export type Garment = z.infer<typeof GarmentSchema>;

/* ---------------------------------------------------------------- 3D側の寸法 */

/** Tシャツの入力4項目（cm）。サイズキーsize_* と1対1 */
export const MeasurementsSchema = z.object({
  length: z.number(), // 着丈：後ろ襟ぐり中心〜裾
  width: z.number(), // 身幅：脇の下の高さの胴回り ÷ 2
  shoulder: z.number(), // 肩幅：肩先〜肩先（背中側）
  sleeve: z.number(), // 袖丈：肩先〜袖口
});
export type Measurements = z.infer<typeof MeasurementsSchema>;
export const MEASUREMENT_KEYS = [
  "length",
  "width",
  "shoulder",
  "sleeve",
] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  length: "着丈",
  width: "身幅",
  shoulder: "肩幅",
  sleeve: "袖丈",
};

/** 服データ（short_sleeve_top）からTシャツの4項目を取り出す。4項目はnullにならない前提 */
export function tshirtMeasurements(g: Garment): Measurements {
  if (g.category !== "short_sleeve_top")
    throw new Error(`Tシャツではありません: ${g.category}`);
  const m = g.measurements;
  return MeasurementsSchema.parse({
    length: m.bodyLengthCm,
    width: m.bodyWidthCm,
    shoulder: m.shoulderWidthCm,
    sleeve: m.sleeveLengthCm,
  });
}

/* ---------------------------------------------------------------- 体型 */

/** 体型4つ。standardはBasisそのもの（キーなし）。がっしり＝筋肉、ぽっちゃり＝体重 */
export const BUILDS = ["slim", "standard", "broad", "chubby"] as const;
export type Build = (typeof BUILDS)[number];
export const BUILD_LABELS: Record<Build, string> = {
  slim: "細身",
  standard: "標準",
  broad: "がっしり",
  chubby: "ぽっちゃり",
};
/** 体型キー名（体とTシャツで共通）。standardはキーなし */
export function buildKey(build: Build): string | null {
  return build === "standard" ? null : `build_${build}`;
}
export const BUILD_KEYS = BUILDS.map(buildKey).filter(
  (k): k is string => k !== null,
);

/** 体型キーの値：選んだ体型だけ1、ほかは0（排他） */
export function buildKeyValues(build: Build): Record<string, number> {
  return Object.fromEntries(
    BUILD_KEYS.map((k) => [k, k === buildKey(build) ? 1 : 0]),
  );
}

/* ---------------------------------------------------------------- 身長 */

/** 入力できる身長（cm）。Blenderで基準寸法とキーの効き方を測った範囲 */
export const HEIGHT_MIN_CM = 150;
export const HEIGHT_MAX_CM = 195;

const KeyMatrixSchema = z.array(z.array(z.number()).length(4)).length(4);

/**
 * tshirt_male_height.json：標準の身長と、体型・身長ごとの基準寸法とsize_* キーの効き方M、体の身幅。
 * Mはsize_* キー1.0あたりの各寸法の変化（行 = parts, 列 = partsの順のsize_* キー）。
 * 体の身幅は、服の身幅と同じ高さで体を切った胴の一周÷2（cm）。身長は昇順
 */
export const HeightTableSchema = z.object({
  standard_cm: z.number(),
  parts: z.array(z.enum(MEASUREMENT_KEYS)).length(4),
  builds: z.record(
    z.enum(BUILDS),
    z
      .array(
        z.object({
          height_cm: z.number(),
          body_width: z.number(),
          base: MeasurementsSchema,
          m: KeyMatrixSchema,
        }),
      )
      .min(2),
  ),
});
export type HeightTable = z.infer<typeof HeightTableSchema>;

/** 身長キーの値：標準の身長より高ければheight_up、低ければheight_down（1.0 = 1cm） */
export function heightKeyValues(
  heightCm: number,
  table: { standard_cm: number },
): Record<string, number> {
  const delta = heightCm - table.standard_cm;
  return { height_up: Math.max(delta, 0), height_down: Math.max(-delta, 0) };
}

/** その体型・身長での基準寸法とキーの効き方M、体の身幅（cm） */
export type Fit = { base: Measurements; m: number[][]; bodyWidth: number };

/**
 * 身長の昇順に並んだ表から、heightCmの前後の行と、その間の割合を返す（範囲の外は端の行）。
 * mix(a, b)は、前後の行の値を直線で補間する
 */
export function heightBlend<T extends { height_cm: number }>(
  samples: T[],
  heightCm: number,
) {
  const last = samples.length - 1;
  const h = Math.min(
    Math.max(heightCm, samples[0].height_cm),
    samples[last].height_cm,
  );
  const i = Math.max(
    0,
    Math.min(samples.findIndex((s) => s.height_cm >= h) - 1, last - 1),
  );
  const lo = samples[i];
  const hi = samples[i + 1];
  const t = (h - lo.height_cm) / (hi.height_cm - lo.height_cm);
  return { lo, hi, mix: (a: number, b: number) => a * (1 - t) + b * t };
}

/** 前後の身長の基準寸法とMを直線で補間する（範囲の外は端の値） */
export function fitAt(build: Build, heightCm: number, table: HeightTable): Fit {
  const { lo, hi, mix } = heightBlend(table.builds[build], heightCm);
  return {
    base: Object.fromEntries(
      MEASUREMENT_KEYS.map((p) => [p, mix(lo.base[p], hi.base[p])]),
    ) as Measurements,
    m: lo.m.map((row, r) => row.map((v, c) => mix(v, hi.m[r][c]))),
    bodyWidth: mix(lo.body_width, hi.body_width),
  };
}

/* ---------------------------------------------------------------- 着られるか */

/** 服の伸び。身幅が体の身幅よりこの割合を超えて小さい服は、伸ばしても着られないとみなす */
export const STRETCH_RATIO = 0.1;

/**
 * 服がその体に着られるか。身幅だけで決める。
 * fits：体の身幅以上 / tight：体の身幅より小さいが、伸ばせば着られる / tooSmall：伸ばしても小さすぎる
 */
export type FitStatus = "fits" | "tight" | "tooSmall";

export function fitStatus(target: Measurements, fit: Fit): FitStatus {
  if (target.width >= fit.bodyWidth) return "fits";
  if (target.width >= fit.bodyWidth * (1 - STRETCH_RATIO)) return "tight";
  return "tooSmall";
}

/* ---------------------------------------------------------------- サイズキー */

/** 連立方程式A x = b（ガウスの消去法） */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * 実寸4項目からsize_* キーの値（1.0 = +1cm）を決める。
 * キーどうしの影響（身幅を広げると着丈も少し伸びる等）を打ち消すため、
 * M × キー = 実寸 − その体型・身長の基準寸法  を解く。
 */
export function sizeKeyValues(
  target: Measurements,
  fit: Fit,
  table: HeightTable,
): Record<string, number> {
  const k = solveLinear(
    MEASUREMENT_KEYS.map((p) => fit.m[table.parts.indexOf(p)]),
    MEASUREMENT_KEYS.map((p) => target[p] - fit.base[p]),
  );
  return Object.fromEntries(table.parts.map((p, i) => [`size_${p}`, k[i]]));
}
