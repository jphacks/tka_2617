import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import presetsJson from "@/../public/presets/presets.json";
import { AVATAR_MODELS } from "@/lib/avatar-models";
import type { ModelGender } from "@/lib/avatar-settings";

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
    const models = AVATAR_MODELS[gender];
    const tops = Object.values(models.tops).map((top) => top.url);
    for (const url of [models.avatar, models.trousers, ...tops])
      assert.ok(existsSync(path.join(PUBLIC, url)), `${url}がありません`);
  }
});

void test("女性の体のglbには、体と同じ頂点の並び・キー・_coverを持つ着せるための体がある", () => {
  const { gltf, positions } = readGltf(AVATAR_MODELS.female.avatar);
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
  const { gltf } = readGltf(AVATAR_MODELS.male.avatar);
  assert.ok(!gltf.nodes.some((n) => n.name === "avatar_fit"));
});

void test("Blenderの身長の表は、性別ごとの入力できる身長の両端を含み、標準の身長はその間にある", () => {
  type Table = {
    standard_cm: number;
    builds: Record<string, { height_cm: number }[]>;
  };
  for (const gender of GENDERS) {
    const { tops, trouserTable, heightRangeCm } = AVATAR_MODELS[gender];
    const [min, max] = heightRangeCm;
    const tables: Table[] = [
      ...Object.values(tops).map((top) => top.table),
      trouserTable,
    ];
    for (const table of tables) {
      assert.ok(min < table.standard_cm && table.standard_cm < max);
      // Blenderが測った身長の表は、入力できる範囲の両端を含む
      for (const rows of Object.values(table.builds)) {
        assert.equal(rows[0].height_cm, min);
        assert.equal(rows[rows.length - 1].height_cm, max);
      }
    }
  }
});

void test("どちらの性別も、髪・靴・顔のパーツのglbがある（女性はpresets/female/の下）", () => {
  const paths = [
    ...presetsJson.hair.map((h) => h.path),
    ...presetsJson.shoes.map((s) => s.path),
    presetsJson.face.path,
  ];
  assert.equal(
    AVATAR_MODELS.female.presetUrl("/presets/hair/short.glb"),
    "/presets/female/hair/short.glb",
  );
  for (const gender of GENDERS) {
    for (const p of paths) {
      const url = AVATAR_MODELS[gender].presetUrl(p);
      assert.ok(existsSync(path.join(PUBLIC, url)), `${url}がありません`);
    }
  }
});
