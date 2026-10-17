/**
 * ズボンの裾のたまり。股下が長くて裾が床より下に出るとき、裾の近くを縦に縮めて床の上へ戻し、
 * 縮めた分を何段かのしわの山として脚の外へふくらませる（足首に布が重なった形）。
 * 座標はワールド座標で、上がY（床はY = 0）。左右の脚はXの符号で分ける。
 * 靴を履いているときは、floorAtに靴の表面の高さを渡す。裾は靴の甲の上で止めてたまらせ、
 * かかと・横は靴の外へ垂らして床まで落とす
 */

/** 裾の一番下を、床（靴を履いていれば靴の表面）からこの高さに止める */
const FLOOR_GAP_M = 0.004;
/**
 * 裾を靴の上に乗せるのは、その頂点から脚の外へこの距離の所にも靴がある所（甲・つま先の方）だけ。
 * かかとや横のように、裾のすぐ外で靴が終わる所は、布が靴の外へ垂れて床まで落ちる
 */
const SUPPORT_OUTWARD_M = 0.015;
/** 裾からこの高さまでの範囲で縮める（余った長さの分は、さらに上まで広げる） */
const STACK_HEIGHT_M = 0.12;
/** 裾の輪とみなす、一番下からの高さ */
const HEM_BAND_M = 0.03;
/** 裾の輪を一周、この数の向きに分けて靴の表面の高さを測り、両側 PROFILE_SMOOTH 個の向きと平均する（かかとの縁などで段にならないように） */
const PROFILE_BINS = 36;
const PROFILE_SMOOTH = 3;
/** しわの山の数 */
const FOLDS = 4;
/** しわの山の高さ：余った長さに対する割合と、上限 */
const FOLD_RATIO = 0.25;
const FOLD_MAX_M = 0.018;

/** (x, z) の真下の床・靴の表面の高さ */
export type FloorAt = (x: number, z: number) => number;

export function stackHems(pos: Float32Array, floorAt: FloorAt = () => 0) {
  for (const side of [-1, 1] as const) {
    const leg: number[] = [];
    let minY = Infinity;
    for (let i = 0; i < pos.length / 3; i++) {
      if (pos[i * 3] * side <= 0) continue;
      leg.push(i);
      minY = Math.min(minY, pos[i * 3 + 1]);
    }
    // 裾の輪の中心（XZ）
    let cx = 0,
      cz = 0,
      count = 0;
    for (const i of leg) {
      if (pos[i * 3 + 1] > minY + HEM_BAND_M) continue;
      cx += pos[i * 3];
      cz += pos[i * 3 + 2];
      count++;
    }
    cx /= count;
    cz /= count;
    /** 裾を支える高さ：外側にも靴が続いていればその真下の靴の表面、続いていなければ床 */
    const support = (x: number, z: number) => {
      const r = Math.hypot(x - cx, z - cz) || 1;
      const ox = x + ((x - cx) / r) * SUPPORT_OUTWARD_M;
      const oz = z + ((z - cz) / r) * SUPPORT_OUTWARD_M;
      return floorAt(ox, oz) > 0 ? floorAt(x, z) : 0;
    };
    // 裾の輪を支える一番高い所の上で止める（裾が靴に入らないように）
    let floor = FLOOR_GAP_M;
    for (const i of leg) {
      if (pos[i * 3 + 1] > minY + HEM_BAND_M) continue;
      floor = Math.max(
        floor,
        support(pos[i * 3], pos[i * 3 + 2]) + FLOOR_GAP_M,
      );
    }
    const excess = floor - minY;
    if (excess <= 0) continue;

    // 裾の輪の向きごとの、靴の表面の高さ（なめらかにしたもの）
    const raw = new Array<number>(PROFILE_BINS).fill(-Infinity);
    const angleBin = (x: number, z: number) =>
      Math.floor(
        ((Math.atan2(z - cz, x - cx) / (2 * Math.PI) + 1) % 1) * PROFILE_BINS,
      ) % PROFILE_BINS;
    for (const i of leg) {
      if (pos[i * 3 + 1] > minY + HEM_BAND_M) continue;
      const x = pos[i * 3],
        z = pos[i * 3 + 2];
      const b = angleBin(x, z);
      raw[b] = Math.max(raw[b], support(x, z) + FLOOR_GAP_M);
    }
    for (let b = 0; b < PROFILE_BINS; b++)
      if (raw[b] === -Infinity) raw[b] = FLOOR_GAP_M;
    const profile = raw.map((_, b) => {
      let sum = 0;
      for (let k = -PROFILE_SMOOTH; k <= PROFILE_SMOOTH; k++)
        sum += raw[(b + k + PROFILE_BINS) % PROFILE_BINS];
      return sum / (2 * PROFILE_SMOOTH + 1);
    });

    const top = minY + STACK_HEIGHT_M + excess;
    const scale = (top - floor) / (top - minY);
    const amp = Math.min(FOLD_RATIO * excess, FOLD_MAX_M);
    for (const i of leg) {
      const y = pos[i * 3 + 1];
      if (y >= top) continue;
      const x = pos[i * 3],
        z = pos[i * 3 + 2];
      // 縮める：topは動かさず、一番下がfloorに来るように
      const s = (top - y) / (top - minY);
      // 垂らす：その向きの表面が低ければ、裾（s = 1）に近いほどそこへ下げる
      const local = profile[angleBin(x, z)];
      const drop = Math.max(floor - local, 0) * s * s;
      pos[i * 3 + 1] = top - (top - y) * scale - drop;
      // しわ：裾（s = 1）に近いほど大きく、上端（s = 0）では0
      const fold = Math.abs(Math.sin(Math.PI * FOLDS * s)) * amp * s;
      const dx = x - cx;
      const dz = z - cz;
      const r = Math.hypot(dx, dz);
      if (r === 0) continue;
      pos[i * 3] += (dx / r) * fold;
      pos[i * 3 + 2] += (dz / r) * fold;
    }
  }
}
