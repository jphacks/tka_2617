import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { modelUrls, type ModelGender } from "@/lib/avatar-models";

const PUBLIC = path.join(import.meta.dirname, "..", "public");
const GENDERS: ModelGender[] = ["male", "female"];

type Gltf = {
  nodes: { name: string; mesh?: number }[];
  meshes: {
    name: string;
    extras?: { targetNames?: string[] };
    primitives: { attributes: Record<string, number> }[];
  }[];
  accessors: { count: number; bufferView: number; byteOffset?: number }[];
  bufferViews: { byteOffset?: number }[];
};

/**
 * glbのJSONの部分（ノードの名前・キーの名前・頂点の属性）と、頂点の位置を読む関数。
 * three.jsのメッシュの名前はノードの名前
 */
function readGltf(url: string) {
  const buf = readFileSync(path.join(PUBLIC, url));
  const length = buf.readUInt32LE(12);
  const gltf = JSON.parse(
    buf.subarray(20, 20 + length).toString("utf8"),
  ) as Gltf;
  const bin = 20 + length + 8;
  const positions = (accessor: number) => {
    const a = gltf.accessors[accessor];
    const start =
      bin +
      (gltf.bufferViews[a.bufferView].byteOffset ?? 0) +
      (a.byteOffset ?? 0);
    return new Float32Array(
      buf.buffer.slice(
        buf.byteOffset + start,
        buf.byteOffset + start + a.count * 12,
      ),
    );
  };
  return { gltf, positions };
}

void test("どちらの性別も、体・ズボン・上の服のglbがある", () => {
  for (const gender of GENDERS) {
    const urls = modelUrls(gender);
    for (const url of [urls.avatar, urls.trousers, ...Object.values(urls.tops)])
      assert.ok(existsSync(path.join(PUBLIC, url)), `${url}がありません`);
  }
});

void test("女性の体のglbには、体と同じ頂点の並び・キー・_coverを持つ着せるための体がある", () => {
  const { gltf, positions } = readGltf(modelUrls("female").avatar);
  const mesh = (name: string) => {
    const node = gltf.nodes.find((n) => n.name === name);
    assert.ok(node?.mesh !== undefined, `${name}がありません`);
    return gltf.meshes[node.mesh];
  };
  const body = mesh("avatar");
  const fit = mesh("avatar_fit");
  const count = (m: Gltf["meshes"][number]) =>
    gltf.accessors[m.primitives[0].attributes.POSITION].count;
  assert.equal(count(fit), count(body));
  // 同じ番号の頂点は同じ所にあり、違うのは胸の前を前へ出した所だけ（ブラウザは着せるための体の頂点番号を体にも使う）
  const a = positions(body.primitives[0].attributes.POSITION);
  const b = positions(fit.primitives[0].attributes.POSITION);
  let moved = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
    assert.ok(d < 0.04, `頂点${String(i / 3)}が${String(d)}m離れている`);
    if (d > 1e-4) moved++;
  }
  assert.ok(moved > 0 && moved < count(body) * 0.05);
  assert.deepEqual(fit.extras?.targetNames, body.extras?.targetNames);
  assert.ok("_COVER" in fit.primitives[0].attributes);
});

void test("男性の体のglbには、着せるための体は無い（体に対して押し出す）", () => {
  const { gltf } = readGltf(modelUrls("male").avatar);
  assert.ok(!gltf.nodes.some((n) => n.name === "avatar_fit"));
});
