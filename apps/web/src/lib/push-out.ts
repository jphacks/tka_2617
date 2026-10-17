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
 * 突き抜け対策：服の頂点が体の内側（または体からOFFSET未満）にあれば、体の外へ押し出す。
 * morph targetをCPUで合成して今の形を求め、体のBVHで最寄り点を探して押し出し量を決める。
 * 押し出したあと、服で覆われる体の頂点が服の外へ出ていれば、その近くの服の頂点をさらに外へ足す。
 * 押し出し量は服のシェーダーに頂点属性pushOffsetとして渡し、morphの後に足す。
 */
export const PUSH_OFFSET_M = 0.008; // 体から最低8mm離す（頂点の間の面から体が出ないよう余裕を持たせる）
const SMOOTH_ITERS = 4;
// 服の縁（裾・袖口・襟）の押し出し量を、縁に沿った両隣とならす回数。
// 縁の頂点は片側にしか隣が無く、隣どうしで押し出し量がそろわないと、縁がギザギザになるため
const RIM_SMOOTH_ITERS = 3;
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
 * weld[i] = まとめた頂点番号、neighbors[j] = まとめた頂点jの隣の頂点、
 * rim[j] = 縁の頂点jの、縁に沿った隣の頂点（縁でなければ空）
 */
export type Topology = {
  weld: Int32Array;
  count: number;
  neighbors: number[][];
  rim: number[][];
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
  // 三角形1つにしか使われていない辺が縁
  const edgeUse = new Map<string, number>();
  const countEdge = (a: number, b: number) => {
    const k = a < b ? `${String(a)},${String(b)}` : `${String(b)},${String(a)}`;
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  };
  const index = shirt.geometry.getIndex();
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const a = weld[index.getX(t)],
        b = weld[index.getX(t + 1)],
        c = weld[index.getX(t + 2)];
      sets[a].add(b).add(c);
      sets[b].add(a).add(c);
      sets[c].add(a).add(b);
      countEdge(a, b);
      countEdge(b, c);
      countEdge(c, a);
    }
  }
  const rim = Array.from({ length: key.size }, () => [] as number[]);
  for (const [k, n] of edgeUse) {
    if (n !== 1) continue;
    const [a, b] = k.split(",").map(Number);
    rim[a].push(b);
    rim[b].push(a);
  }
  return { weld, count: key.size, neighbors: sets.map((s) => [...s]), rim };
}

export type PushStats = { ms: number; pushed: number; maxCm: number };

// 重ね着：外側の服は、内側の服からこの距離まで離す（体より薄くてよい）
const LAYER_OFFSET_M = 0.004;
// 内側の服の面を、この距離まで探す
const LAYER_SEARCH_M = 0.05;
// 内側の服の一番近い点が、この距離より下にあれば、縁より上の頂点とみなす
const LAYER_ABOVE_M = 0.002;
// 縁より上の頂点は、縁からこの高さまでで押し出しをなだらかに弱める。
// 押す・押さないを0か1かで決めると、裾が縁の高さにあるとき、隣どうしで交互にずれて歯の形になるため
const LAYER_FADE_M = 0.02;
// 水平に押すとき、斜めの面ほど多く押す。その割合の上限（cos がこれより小さくても、これで割る）
const LAYER_MIN_COS = 0.5;

/**
 * 内側に着ている服の衝突判定（ワールド座標）。topYより上の頂点は比べない。
 * samplesは、外側の服の外へ出ていないかを確かめる点（頂点と辺の中点、xyzの並び）
 */
export type GarmentCollider = {
  bvh: MeshBVH;
  geometry: BufferGeometry;
  topY: number;
  samples: Float32Array;
};

export type PushOptions = {
  /** この服で完全に覆われる体の頂点。空なら、頂点の間から体が出ていないかを確かめない */
  covered?: Uint32Array;
  /** 内側に着ている服。体と同じように、この外へ押し出す */
  layers?: GarmentCollider[];
  /** 押し出す前に、服の今の形（ワールド座標）を変える（裾のたまりなど） */
  prepare?: (pos: Float32Array) => void;
  /**
   * prepareの後の服の形（ワールド座標）と体の形から、ほかにも服で覆われる体の頂点を決める（手にかぶせた袖など）。
   * coveredと違い、服の裾より下の点も比べる
   */
  coveredAfterPrepare?: (pos: Float32Array, bodyPos: Float32Array) => number[];
};

/**
 * 服の今の形と体のBVHから押し出し量を計算し、服のpushOffset属性（ローカル座標）に書く
 */
export function updatePush(
  garment: Mesh,
  body: BodyCollider,
  topo: Topology,
  {
    covered = body.covered,
    layers = [],
    prepare,
    coveredAfterPrepare,
  }: PushOptions = {},
): PushStats {
  const t0 = performance.now();
  const attr = ensurePushAttribute(garment);
  const out = attr.array as Float32Array;

  garment.updateWorldMatrix(true, false);
  const pos = morphedPositions(garment);
  applyMatrix(pos, garment.matrixWorld);
  const morphed = pos.slice();
  prepare?.(pos);

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

  for (const layer of layers) {
    pushFromLayer(pos, push, topo, layer);
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

  const garmentIndex = garment.geometry.getIndex();
  if (garmentIndex) {
    coverTips(
      pos,
      push,
      topo,
      garmentIndex.array,
      body.geometry.getAttribute("position").array as Float32Array,
      covered,
      PUSH_OFFSET_M / 2,
      true,
    );
    if (coveredAfterPrepare) {
      const bodyPos = body.geometry.getAttribute("position")
        .array as Float32Array;
      coverTips(
        pos,
        push,
        topo,
        garmentIndex.array,
        bodyPos,
        coveredAfterPrepare(pos, bodyPos),
        PUSH_OFFSET_M / 2,
      );
    }
    // 内側の服の縁（ズボンのウエストの上端など）が、頂点の間から出ないようにする
    for (const layer of layers) {
      coverTips(
        pos,
        push,
        topo,
        garmentIndex.array,
        layer.samples,
        Array.from({ length: layer.samples.length / 3 }, (_, k) => k),
        LAYER_OFFSET_M,
        true,
      );
    }
  }

  // 縁の押し出し量を、縁に沿った両隣とならす
  for (let it = 0; it < RIM_SMOOTH_ITERS; it++) {
    const next = push.slice();
    for (let j = 0; j < topo.count; j++) {
      const nb = topo.rim[j];
      if (nb.length < 2) continue;
      for (let ax = 0; ax < 3; ax++) {
        let sum = 0;
        for (const k of nb) sum += push[k * 3 + ax];
        next[j * 3 + ax] = 0.5 * push[j * 3 + ax] + (0.5 * sum) / nb.length;
      }
    }
    push.set(next);
  }

  // ワールド → 服のローカル（向きだけ）にして、分かれた頂点にも配る。
  // prepareで変えた分も、押し出しと一緒にpushOffsetへ入れる
  const toLocal = new Matrix3().setFromMatrix4(garment.matrixWorld).invert();
  const v = new Vector3();
  let maxCm = 0;
  for (let i = 0; i < topo.weld.length; i++) {
    const j = topo.weld[i];
    v.set(push[j * 3], push[j * 3 + 1], push[j * 3 + 2]);
    maxCm = Math.max(maxCm, v.length() * 100);
    v.x += pos[i * 3] - morphed[i * 3];
    v.y += pos[i * 3 + 1] - morphed[i * 3 + 1];
    v.z += pos[i * 3 + 2] - morphed[i * 3 + 2];
    v.applyMatrix3(toLocal);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  attr.needsUpdate = true;
  return { ms: performance.now() - t0, pushed, maxCm };
}

/**
 * 内側の服から LAYER_OFFSET_M 未満の頂点を、内側の服の外へ押し出す（体からの押し出しより大きい方を残す）。
 * 内側の服の上端より上の頂点は比べない。上端の縁を最寄りの面として拾い、外へ押してしまうため
 */
function pushFromLayer(
  pos: Float32Array,
  push: Float32Array,
  topo: Topology,
  layer: GarmentCollider,
) {
  const index = layer.geometry.getIndex();
  if (!index) return;
  const lpos = layer.geometry.getAttribute("position");
  const done = new Uint8Array(topo.count);
  const p = new Vector3(),
    n = new Vector3(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  for (let i = 0; i < topo.weld.length; i++) {
    const j = topo.weld[i];
    if (done[j]) continue;
    done[j] = 1;
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    if (p.y > layer.topY) continue;
    if (!layer.bvh.closestPointToPoint(p, hit, 0, LAYER_SEARCH_M)) continue;
    // 一番近い点がこの頂点より下にある：内側の服の縁より上にいる。
    // 縁から離れるほど押し出しを弱める（縁の高さは場所で違うので、topYだけでは判定できない）
    const above = p.y - hit.point.y;
    if (above >= LAYER_FADE_M) continue;
    const weight =
      above <= LAYER_ABOVE_M
        ? 1
        : 1 -
          smooth01((above - LAYER_ABOVE_M) / (LAYER_FADE_M - LAYER_ABOVE_M));
    const f = hit.faceIndex * 3;
    a.fromBufferAttribute(lpos, index.getX(f));
    b.fromBufferAttribute(lpos, index.getX(f + 1));
    c.fromBufferAttribute(lpos, index.getX(f + 2));
    n.subVectors(c, b).cross(a.sub(b)).normalize();
    const sd = p.clone().sub(hit.point).dot(n);
    if (sd >= LAYER_OFFSET_M) continue;
    // 水平にだけ押す。布は内側の服のふくらみの上から垂れて外へ広がるので、
    // 斜め下向きの法線に沿って押すと、裾が下へ引っ張られてトゲになる
    const cos = Math.hypot(n.x, n.z);
    if (cos < 1e-3) continue;
    const d = ((LAYER_OFFSET_M - sd) / Math.max(cos, LAYER_MIN_COS)) * weight;
    n.set(n.x / cos, 0, n.z / cos);
    if (d > Math.hypot(push[j * 3], push[j * 3 + 1], push[j * 3 + 2])) {
      push[j * 3] = n.x * d;
      push[j * 3 + 1] = n.y * d;
      push[j * 3 + 2] = n.z * d;
    }
  }
}

function smooth01(t: number) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/** 押し出した後の服の形（ワールド座標）から、外側に着る服のための衝突判定を作る */
export function buildGarmentCollider(garment: Mesh): GarmentCollider {
  garment.updateWorldMatrix(true, false);
  const pos = morphedPositions(garment);
  if (garment.geometry.hasAttribute("pushOffset")) {
    const offset = garment.geometry.getAttribute("pushOffset");
    for (let i = 0; i < offset.count; i++) {
      pos[i * 3] += offset.getX(i);
      pos[i * 3 + 1] += offset.getY(i);
      pos[i * 3 + 2] += offset.getZ(i);
    }
  }
  applyMatrix(pos, garment.matrixWorld);
  let topY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) topY = Math.max(topY, pos[i]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  const index = garment.geometry.getIndex();
  if (index)
    geometry.setIndex(new BufferAttribute(new Uint32Array(index.array), 1));
  return {
    bvh: new MeshBVH(geometry),
    geometry,
    topY,
    samples: pointsWithEdgeMidpoints(pos, index?.array ?? []),
  };
}

/** 頂点に、三角形の辺の中点を足した点の並び。内側の服の縁の線が、外側の服の頂点の間から出ないかを確かめるため */
function pointsWithEdgeMidpoints(pos: Float32Array, index: ArrayLike<number>) {
  const seen = new Set<string>();
  const mids: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[t + e];
      const b = index[t + ((e + 1) % 3)];
      const k =
        a < b ? `${String(a)},${String(b)}` : `${String(b)},${String(a)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      for (let ax = 0; ax < 3; ax++) {
        mids.push((pos[a * 3 + ax] + pos[b * 3 + ax]) / 2);
      }
    }
  }
  const out = new Float32Array(pos.length + mids.length);
  out.set(pos);
  out.set(mids, pos.length);
  return out;
}

/**
 * 体や内側の服の頂点（points の indices）が、押し出した後の服の外へ出ていたら、その面の頂点を外へ足す（pushを書き換える）。
 * 服の頂点の間隔が広い所では、頂点は外にあっても、面が体の盛り上がりや内側の服の縁の内側を通るため。gap はその面から離す距離
 */
function coverTips(
  pos: Float32Array,
  push: Float32Array,
  topo: Topology,
  shirtIndex: ArrayLike<number>,
  points: Float32Array,
  indices: ArrayLike<number> & Iterable<number>,
  gap: number,
  /**
   * 一番近い服の点より下にある点は比べない（服の裾より下にあって、覆われていない点）。
   * 体の_coverは基準の長さの服で決めてあるので、着丈を短くすると裾より下に出た体も「覆われる所」のままになる
   */
  skipBelowHem = false,
) {
  if (indices.length === 0) return;
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
  const p = new Vector3(),
    n = new Vector3(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  for (const k of indices) {
    p.fromArray(points, k * 3);
    if (!bvh.closestPointToPoint(p, hit, 0, TIP_SEARCH_M)) continue;
    if (skipBelowHem && hit.point.y - p.y > LAYER_ABOVE_M) continue;
    const f = hit.faceIndex * 3;
    const tri = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    a.fromArray(pushed, tri[0] * 3);
    b.fromArray(pushed, tri[1] * 3);
    c.fromArray(pushed, tri[2] * 3);
    n.subVectors(c, b).cross(a.sub(b)).normalize();
    const out = p.clone().sub(hit.point).dot(n);
    if (out <= -gap) continue;
    const need = out + gap;
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
