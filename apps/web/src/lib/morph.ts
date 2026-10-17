import type { Object3D, Mesh } from "three";

/**
 * root以下のメッシュで、名前がnameのmorph targetをvalueにする。
 * インデックスは直書きせずmorphTargetDictionaryから引く。
 * 戻り値は見つかったメッシュの数（0ならキー名の間違い）。
 */
export function setMorph(root: Object3D, name: string, value: number): number {
  let hit = 0;
  root.traverse((o) => {
    const mesh = o as Mesh;
    const idx = mesh.morphTargetDictionary?.[name];
    if (idx !== undefined && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[idx] = value;
      hit++;
    }
  });
  return hit;
}
