/**
 * ズボンの裾のたまり。股下が長くて裾が床より下に出るとき、裾の近くを縦に縮めて床の上へ戻し、
 * 縮めた分を何段かのしわの山として脚の外へふくらませる（足首に布が重なった形）。
 * 座標はワールド座標で、上がY（床はY = 0）。左右の脚はXの符号で分ける
 */

/** 裾の一番下を、床からこの高さに止める */
const FLOOR_GAP_M = 0.012;
/** 裾からこの高さまでの範囲で縮める（余った長さの分は、さらに上まで広げる） */
const STACK_HEIGHT_M = 0.12;
/** しわの山の数 */
const FOLDS = 4;
/** しわの山の高さ：余った長さに対する割合と、上限 */
const FOLD_RATIO = 0.25;
const FOLD_MAX_M = 0.018;

export function stackHems(pos: Float32Array) {
  for (const side of [-1, 1]) {
    const leg: number[] = [];
    let minY = Infinity;
    for (let i = 0; i < pos.length / 3; i++) {
      if (pos[i * 3] * side <= 0) continue;
      leg.push(i);
      minY = Math.min(minY, pos[i * 3 + 1]);
    }
    const excess = FLOOR_GAP_M - minY;
    if (excess <= 0) continue;

    const top = minY + STACK_HEIGHT_M + excess;
    // 裾の近くの脚の中心（XZ）
    let cx = 0,
      cz = 0,
      count = 0;
    for (const i of leg) {
      if (pos[i * 3 + 1] > minY + 0.05) continue;
      cx += pos[i * 3];
      cz += pos[i * 3 + 2];
      count++;
    }
    cx /= count;
    cz /= count;

    const scale = (top - FLOOR_GAP_M) / (top - minY);
    const amp = Math.min(FOLD_RATIO * excess, FOLD_MAX_M);
    for (const i of leg) {
      const y = pos[i * 3 + 1];
      if (y >= top) continue;
      // 縮める：topは動かさず、一番下がFLOOR_GAP_Mに来るように
      pos[i * 3 + 1] = top - (top - y) * scale;
      // しわ：裾（s = 1）に近いほど大きく、上端（s = 0）では0
      const s = (top - y) / (top - minY);
      const fold = Math.abs(Math.sin(Math.PI * FOLDS * s)) * amp * s;
      const dx = pos[i * 3] - cx;
      const dz = pos[i * 3 + 2] - cz;
      const r = Math.hypot(dx, dz);
      if (r === 0) continue;
      pos[i * 3] += (dx / r) * fold;
      pos[i * 3 + 2] += (dz / r) * fold;
    }
  }
}
