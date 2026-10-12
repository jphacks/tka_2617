import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Vector3,
  type Material,
  type Mesh,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

/**
 * 突き抜け対策E（試作）：服の頂点が体の内側（または体からOFFSET未満）にあれば、体の外へ押し出す。
 * morph targetをCPUで合成して今の形を求め、体のBVHで最寄り点を探して押し出し量を決める。
 * 押し出したあと、服で覆われる体の頂点が服の外へ出ていれば、その近くの服の頂点をさらに外へ足す。
 * 押し出し量は服のシェーダーに頂点属性pushOffsetとして渡し、morphの後に足す。
 */
export const PUSH_OFFSET_M = 0.008; // 体から最低8mm離す（頂点の間の面から体が出ないよう余裕を持たせる）
const SMOOTH_ITERS = 4;
// 服の外へ出ていないか確かめる体の頂点：服で完全に覆われる所（_coverがこれ以上）だけ。
// 首・腕・脚まで見ると、襟や裾を体に沿って押し広げてしまう
const COVERED_MIN = 0.99;
// 体の頂点から、この距離より遠い服の面は見ない
const TIP_SEARCH_M = 0.03;

export type BodyCollider = {
  bvh: MeshBVH;
  geometry: BufferGeometry;
  /** 服で完全に覆われる体の頂点の番号 */
  covered: Uint32Array;
};

/** morph targetを合成した現在の頂点位置（ローカル座標, Float32Array） */
export function morphedPositions(mesh: Mesh): Float32Array {
  const geo = mesh.geometry;
  const base = geo.getAttribute("position");
  const out = new Float32Array(base.array);
  const targets = geo.morphAttributes.position ?? [];
  const inf = mesh.morphTargetInfluences ?? [];
  const relative = geo.morphTargetsRelative;
  targets.forEach((t, i) => {
    const w = inf[i] ?? 0;
    if (!w) return;
    const a = t.array as ArrayLike<number>;
    for (let k = 0; k < out.length; k++)
      out[k] +=
        w * (relative ? a[k] : a[k] - (base.array as ArrayLike<number>)[k]);
  });
  return out;
}

/** 体（今の体型）の衝突判定用BVH。ワールド座標で作る */
export function buildBodyBVH(body: Mesh): BodyCollider {
  body.updateWorldMatrix(true, false);
  const pos = morphedPositions(body);
  applyMatrix(pos, body.matrixWorld);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  const index = body.geometry.getIndex();
  if (index)
    geometry.setIndex(new BufferAttribute(new Uint32Array(index.array), 1));
  const covered: number[] = [];
  if (body.geometry.hasAttribute("_cover")) {
    const cover = body.geometry.getAttribute("_cover");
    for (let i = 0; i < cover.count; i++) {
      if (cover.getX(i) >= COVERED_MIN) covered.push(i);
    }
  }
  // MeshBVHはindexを並べ替えるので、体の元のジオメトリではなく複製に作る
  return {
    bvh: new MeshBVH(geometry),
    geometry,
    covered: Uint32Array.from(covered),
  };
}

function applyMatrix(pos: Float32Array, m: Matrix4) {
  const v = new Vector3();
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    pos[i] = v.x;
    pos[i + 1] = v.y;
    pos[i + 2] = v.z;
  }
}

/**
 * 服の頂点のつながり（UVの継ぎ目で分かれた同じ位置の頂点はまとめる）。
 * weld[i] = まとめた頂点番号、neighbors[j] = まとめた頂点jの隣の頂点
 */
export type Topology = {
  weld: Int32Array;
  count: number;
  neighbors: number[][];
};

export function shirtTopology(shirt: Mesh): Topology {
  const pos = shirt.geometry.getAttribute("position");
  const key = new Map<string, number>();
  const weld = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    let id = key.get(k);
    if (id === undefined) key.set(k, (id = key.size));
    weld[i] = id;
  }
  const sets = Array.from({ length: key.size }, () => new Set<number>());
  const index = shirt.geometry.getIndex();
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const a = weld[index.getX(t)],
        b = weld[index.getX(t + 1)],
        c = weld[index.getX(t + 2)];
      sets[a].add(b).add(c);
      sets[b].add(a).add(c);
      sets[c].add(a).add(b);
    }
  }
  return { weld, count: key.size, neighbors: sets.map((s) => [...s]) };
}

export type PushStats = { ms: number; pushed: number; maxCm: number };

/**
 * 服の今の形と体のBVHから押し出し量を計算し、服のpushOffset属性（ローカル座標）に書く
 */
export function updatePush(
  shirt: Mesh,
  body: BodyCollider,
  topo: Topology,
  enabled: boolean,
): PushStats {
  const t0 = performance.now();
  const attr = ensurePushAttribute(shirt);
  const out = attr.array as Float32Array;
  out.fill(0);
  if (!enabled) {
    attr.needsUpdate = true;
    return { ms: 0, pushed: 0, maxCm: 0 };
  }

  shirt.updateWorldMatrix(true, false);
  const pos = morphedPositions(shirt);
  applyMatrix(pos, shirt.matrixWorld);

  // まとめた頂点ごとに押し出し量（ワールド座標）
  const push = new Float32Array(topo.count * 3);
  const done = new Uint8Array(topo.count);
  const p = new Vector3(),
    n = new Vector3(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const bpos = body.geometry.getAttribute("position");
  const bidx = body.geometry.getIndex();
  if (!bidx) throw new Error("体のメッシュにindexがありません");
  let pushed = 0;
  for (let i = 0; i < topo.weld.length; i++) {
    const j = topo.weld[i];
    if (done[j]) continue;
    done[j] = 1;
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    if (!body.bvh.closestPointToPoint(p, hit, 0, 0.1)) continue;
    const f = hit.faceIndex * 3;
    a.fromBufferAttribute(bpos, bidx.getX(f));
    b.fromBufferAttribute(bpos, bidx.getX(f + 1));
    c.fromBufferAttribute(bpos, bidx.getX(f + 2));
    n.subVectors(c, b).cross(a.sub(b)).normalize(); // 三角形の法線（外向き）
    const sd = p.clone().sub(hit.point).dot(n);
    if (sd < PUSH_OFFSET_M) {
      const d = PUSH_OFFSET_M - sd;
      push[j * 3] = n.x * d;
      push[j * 3 + 1] = n.y * d;
      push[j * 3 + 2] = n.z * d;
      pushed++;
    }
  }

  // 押し出し量を周りへなだらかに広げる（大きい方を残す）
  for (let it = 0; it < SMOOTH_ITERS; it++) {
    const next = push.slice();
    for (let j = 0; j < topo.count; j++) {
      const nb = topo.neighbors[j];
      if (!nb.length) continue;
      let x = 0,
        y = 0,
        z = 0;
      for (const k of nb) {
        x += push[k * 3];
        y += push[k * 3 + 1];
        z += push[k * 3 + 2];
      }
      x /= nb.length;
      y /= nb.length;
      z /= nb.length;
      const cur = Math.hypot(push[j * 3], push[j * 3 + 1], push[j * 3 + 2]);
      if (Math.hypot(x, y, z) > cur) {
        next[j * 3] = 0.5 * push[j * 3] + 0.5 * x;
        next[j * 3 + 1] = 0.5 * push[j * 3 + 1] + 0.5 * y;
        next[j * 3 + 2] = 0.5 * push[j * 3 + 2] + 0.5 * z;
      }
    }
    push.set(next);
  }

  const shirtIndex = shirt.geometry.getIndex();
  if (shirtIndex) {
    coverBodyTips(pos, push, topo, shirtIndex.array, body);
  }

  // ワールド → 服のローカル（向きだけ）にして、分かれた頂点にも配る
  const toLocal = new Matrix3().setFromMatrix4(shirt.matrixWorld).invert();
  const v = new Vector3();
  let maxCm = 0;
  for (let i = 0; i < topo.weld.length; i++) {
    const j = topo.weld[i];
    v.set(push[j * 3], push[j * 3 + 1], push[j * 3 + 2]);
    maxCm = Math.max(maxCm, v.length() * 100);
    v.applyMatrix3(toLocal);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  attr.needsUpdate = true;
  return { ms: performance.now() - t0, pushed, maxCm };
}

/**
 * 服で覆われる体の頂点が、押し出した後の服の外へ出ていたら、その面の頂点を外へ足す（pushを書き換える）。
 * 服の頂点の間隔が広い所では、頂点は体から離れていても、面が体の盛り上がりの内側を通るため
 */
function coverBodyTips(
  pos: Float32Array,
  push: Float32Array,
  topo: Topology,
  shirtIndex: ArrayLike<number>,
  body: BodyCollider,
) {
  const pushed = new Float32Array(pos.length);
  for (let i = 0; i < topo.weld.length; i++) {
    const j = topo.weld[i];
    pushed[i * 3] = pos[i * 3] + push[j * 3];
    pushed[i * 3 + 1] = pos[i * 3 + 1] + push[j * 3 + 1];
    pushed[i * 3 + 2] = pos[i * 3 + 2] + push[j * 3 + 2];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pushed, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(shirtIndex), 1));
  const bvh = new MeshBVH(geometry);
  // MeshBVHが並べ替えた後のindexで、faceIndexから三角形の頂点を引く
  const index = geometry.getIndex();
  if (!index) return;

  const extra = new Float32Array(topo.count * 3);
  const bpos = body.geometry.getAttribute("position");
  const p = new Vector3(),
    n = new Vector3(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  for (const k of body.covered) {
    p.fromBufferAttribute(bpos, k);
    if (!bvh.closestPointToPoint(p, hit, 0, TIP_SEARCH_M)) continue;
    const f = hit.faceIndex * 3;
    const tri = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    a.fromArray(pushed, tri[0] * 3);
    b.fromArray(pushed, tri[1] * 3);
    c.fromArray(pushed, tri[2] * 3);
    n.subVectors(c, b).cross(a.sub(b)).normalize();
    const out = p.clone().sub(hit.point).dot(n);
    if (out <= -PUSH_OFFSET_M / 2) continue;
    const need = out + PUSH_OFFSET_M / 2;
    for (const vi of tri) {
      const j = topo.weld[vi];
      if (need > Math.hypot(extra[j * 3], extra[j * 3 + 1], extra[j * 3 + 2])) {
        extra[j * 3] = n.x * need;
        extra[j * 3 + 1] = n.y * need;
        extra[j * 3 + 2] = n.z * need;
      }
    }
  }
  geometry.dispose();
  for (let k = 0; k < push.length; k++) push[k] += extra[k];
}

/** 服のジオメトリにpushOffset属性を用意し、シェーダーでmorphの後に足すようにする（初回だけ） */
function ensurePushAttribute(shirt: Mesh): BufferAttribute {
  const geo = shirt.geometry;
  let attr = geo.getAttribute("pushOffset") as BufferAttribute | undefined;
  if (attr) return attr;
  attr = new BufferAttribute(
    new Float32Array(geo.getAttribute("position").count * 3),
    3,
  );
  geo.setAttribute("pushOffset", attr);
  const mats = Array.isArray(shirt.material)
    ? shirt.material
    : [shirt.material];
  mats.forEach((m: Material) => {
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 pushOffset;",
        )
        .replace(
          "#include <morphtarget_vertex>",
          "#include <morphtarget_vertex>\ntransformed += pushOffset;",
        );
    };
    m.customProgramCacheKey = () => "push-out";
    m.needsUpdate = true;
  });
  return attr;
}
