/**
 * 長袖の袖。袖丈が腕より長いとき、余った袖が手に垂れた形（Blenderの布のシミュレーションで作ったキー drape_<cm>）を混ぜる。
 * あわせて、袖の中にある腕・手（ひじ、親指など）が袖の面の間から出ないよう、押し出しで確かめる体の頂点を選ぶ。
 * sleeveは頂点ごとの腕に沿った位置（縫い目0 → 袖口1、胴は0。Blenderの_sleeve）
 */

/** 垂れ方のキーを作った、袖丈が腕より長い分（cm）。Blenderの DRAPE_CM と同じ */
const DRAPE_CM = [3, 6, 10] as const;

/** 余った長さ（cm）から、垂れ方のキーの値。間は直線で補間し、10cmより長ければ10cmの形 */
export function drapeKeyValues(excessCm: number): Record<string, number> {
  const values: Record<string, number> = Object.fromEntries(
    DRAPE_CM.map((cm) => [`drape_${String(cm)}`, 0]),
  );
  if (excessCm <= 0) return values;
  const levels = [0, ...DRAPE_CM];
  for (let k = 1; k < levels.length; k++) {
    const lo = levels[k - 1];
    const hi = levels[k];
    if (excessCm <= hi || k === levels.length - 1) {
      const t = Math.min((excessCm - lo) / (hi - lo), 1);
      values[`drape_${String(hi)}`] = t;
      if (lo > 0) values[`drape_${String(lo)}`] = 1 - t;
      break;
    }
  }
  return values;
}

/** 袖の中心線を作るときの区間の数 */
const BINS = 16;
/** 袖の中心線から、その区間の袖の半径のこの倍より内側の体の頂点を、袖の中とみなす */
const INSIDE_RADIUS_RATIO = 1.5;
/** 袖口の中心線の端から、この距離より奥の体の頂点だけを使う（袖口から出ている指先は比べない） */
const CUFF_MARGIN_M = 0.005;

type Vec = [number, number, number];

/**
 * 袖の中にある体の頂点（体の頂点番号）。posは服の今の形、bodyPosは体の今の形（どちらもワールド座標）。
 * 体の_coverはTシャツで決めてあり、前腕・ひじ・手を含まないので、長袖ではこれを足して押し出しで確かめる。
 * sleeveMaxより先（袖口の側）の袖は使わない（袖の中に隠れる腕を描かないとき、袖口の奥まで消さないように）
 */
export function bodyInSleeves(
  pos: Float32Array,
  sleeve: ArrayLike<number>,
  bodyPos: Float32Array,
  sleeveMax = 1,
): number[] {
  const out: number[] = [];
  for (const side of [-1, 1]) {
    // 腕に沿った位置で区間に分け、区間ごとの中心と半径で袖の中心線を作る
    const sum = Array.from({ length: BINS }, () => [0, 0, 0, 0]);
    for (let i = 0; i < sleeve.length; i++) {
      if (sleeve[i] <= 0 || sleeve[i] > sleeveMax || pos[i * 3] * side <= 0)
        continue;
      const b = Math.min(Math.floor(sleeve[i] * BINS), BINS - 1);
      for (let a = 0; a < 3; a++) sum[b][a] += pos[i * 3 + a];
      sum[b][3]++;
    }
    const centers: Vec[] = sum
      .filter((s) => s[3] > 0)
      .map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
    if (centers.length < 2) continue;
    const radii = centers.map(() => 0);
    const counts = centers.map(() => 0);
    const binOf = sum.map((s, b) => (s[3] > 0 ? b : -1)).filter((b) => b >= 0);
    for (let i = 0; i < sleeve.length; i++) {
      if (sleeve[i] <= 0 || sleeve[i] > sleeveMax || pos[i * 3] * side <= 0)
        continue;
      const b = binOf.indexOf(Math.min(Math.floor(sleeve[i] * BINS), BINS - 1));
      const c = centers[b];
      radii[b] += Math.hypot(
        pos[i * 3] - c[0],
        pos[i * 3 + 1] - c[1],
        pos[i * 3 + 2] - c[2],
      );
      counts[b]++;
    }
    for (let b = 0; b < radii.length; b++) radii[b] /= counts[b];

    for (let j = 0; j < bodyPos.length / 3; j++) {
      if (bodyPos[j * 3] * side <= 0) continue;
      const p: Vec = [bodyPos[j * 3], bodyPos[j * 3 + 1], bodyPos[j * 3 + 2]];
      for (let s = 0; s < centers.length - 1; s++) {
        const a = centers[s];
        const b = centers[s + 1];
        const ab: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const len = Math.hypot(...ab);
        const t =
          ((p[0] - a[0]) * ab[0] +
            (p[1] - a[1]) * ab[1] +
            (p[2] - a[2]) * ab[2]) /
          (len * len);
        // 中心線の始まりより前（肩）と、袖口より先は使わない
        if (t < 0 && s === 0) break;
        if (t > 1 - CUFF_MARGIN_M / len && s === centers.length - 2) break;
        if (t < 0 || t > 1) continue;
        const d = Math.hypot(
          p[0] - (a[0] + ab[0] * t),
          p[1] - (a[1] + ab[1] * t),
          p[2] - (a[2] + ab[2] * t),
        );
        const r = radii[s] + (radii[s + 1] - radii[s]) * t;
        if (d < r * INSIDE_RADIUS_RATIO) out.push(j);
        break;
      }
    }
  }
  return out;
}
