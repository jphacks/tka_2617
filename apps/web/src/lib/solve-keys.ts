import tshirtMeasureJson from "@/lib/tshirt-measure.json";

// Blenderで服の計測線を測って書き出したデータ。座標と寸法の単位はcm
export type GarmentMeasure = {
  // シェイプキーの名前。base・minv・d・linesはこの順に並ぶ
  keys: string[];
  // キーがすべて0のときの各部位の寸法
  base: number[];
  // キー同士の連動を打ち消す逆行列。寸法の差をキー値の差に変える
  minv: number[][];
  // 計測線の頂点の座標
  p: number[][];
  // キー値1あたりの各頂点の移動量（d[キー][頂点]）
  d: number[][][];
  // 部位ごとに、長さを足す辺（頂点の番号の組）と、合計にかける係数
  lines: { f: number; e: number[][] }[];
};

export const tshirtMeasure: GarmentMeasure = tshirtMeasureJson;

// シェイプキーを作ったときのRange。この外は形が崩れる
const minWeight = -10;
const maxWeight = 20;
// 逆行列の補正をそのままかけると振動するので、半分ずつ直す
const gain = 0.5;
const toleranceCm = 0.01;
const maxIterations = 50;

export function measureGarment(measure: GarmentMeasure, weights: number[]) {
  const points = measure.p.map((point, i) =>
    point.map(
      (value, axis) =>
        value +
        weights.reduce((sum, w, k) => sum + w * measure.d[k][i][axis], 0),
    ),
  );
  return measure.lines.map(
    ({ f, e }) =>
      f *
      e.reduce(
        (sum, [a, b]) =>
          sum +
          Math.hypot(
            ...points[a].map((value, axis) => value - points[b][axis]),
          ),
        0,
      ),
  );
}

function multiply(matrix: number[][], vector: number[]) {
  return matrix.map((row) =>
    row.reduce((sum, value, j) => sum + value * vector[j], 0),
  );
}

function clampWeight(weight: number) {
  return Math.min(maxWeight, Math.max(minWeight, weight));
}

// 各部位の目標の寸法（cm、keysの順）から、その寸法になるキー値を求める。
// キー同士が連動するため、逆行列で見当をつけたあと、測って直すのを繰り返す
export function solveKeys(measure: GarmentMeasure, targetsCm: number[]) {
  let weights = multiply(
    measure.minv,
    targetsCm.map((target, i) => target - measure.base[i]),
  ).map(clampWeight);

  for (let i = 0; i < maxIterations; i++) {
    const measured = measureGarment(measure, weights);
    const errors = targetsCm.map((target, j) => target - measured[j]);
    if (errors.every((error) => Math.abs(error) < toleranceCm)) {
      break;
    }
    const corrections = multiply(measure.minv, errors);
    weights = weights.map((w, j) => clampWeight(w + gain * corrections[j]));
  }

  return Object.fromEntries(measure.keys.map((key, i) => [key, weights[i]]));
}
