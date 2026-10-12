import type { Material, Mesh, Object3D } from "three";

/**
 * 体の突き抜け対策：服の下になる体を、シェーダーで法線の内側へ縮める。
 * avatar_male.glbの頂点属性
 *   _cover     … 服の下の重み（0〜1、Blenderのcover_weights）
 *   _below_hem … 元の裾から何m下か（胴の真下だけ。対象外は1.0、Blenderのbelow_hem）
 * を使い、morph targetを適用した後の位置を  −法線 × 重み × shrinkだけ動かす。
 * 重み = max(_cover, 裾の下の重み)。裾の下の重みは、着丈キーで伸びた分（hemExt）まで1、その下3cmで0へ。
 * 面を消す方式と違い、服を短くしても穴は開かない（縮めた体が少し見えるだけ）。
 */
export const COVER_SHRINK_M = 0.025; // Blender側COVER_SHRINKと同じ値
export const HEM_FADE_M = 0.03;

export type CoverUniforms = {
  /** 縮める量（m）。0で無効 */
  shrink: { value: number };
  /** 着丈キーで裾が元より下がった量（m） */
  hemExt: { value: number };
};

/** 着丈キーの値（1.0 = +1cm）からhemExt（m） */
export function hemExtension(sizeLength: number): number {
  return Math.max(sizeLength, 0) * 0.01;
}

export function applyCoverShrink(root: Object3D, u: CoverUniforms): number {
  let n = 0;
  root.traverse((o) => {
    if (!("isMesh" in o)) return;
    const mesh = o as Mesh;
    if (
      !mesh.geometry.hasAttribute("_cover") ||
      !mesh.geometry.hasAttribute("_below_hem")
    ) {
      return;
    }
    const cover = mesh.geometry.getAttribute("_cover");
    const below = mesh.geometry.getAttribute("_below_hem");
    // "_"で始まる名前はGLSLでは避けたいので付け替える
    mesh.geometry.setAttribute("coverWeight", cover);
    mesh.geometry.setAttribute("belowHem", below);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: Material) => {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uCoverShrink = u.shrink;
        shader.uniforms.uHemExt = u.hemExt;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            [
              "#include <common>",
              "attribute float coverWeight;",
              "attribute float belowHem;",
              "uniform float uCoverShrink;",
              "uniform float uHemExt;",
            ].join("\n"),
          )
          .replace(
            "#include <morphtarget_vertex>",
            [
              "#include <morphtarget_vertex>",
              `float hemW = 1.0 - smoothstep(uHemExt, uHemExt + ${HEM_FADE_M.toFixed(3)}, belowHem);`,
              "float coverW = max(coverWeight, hemW);",
              "transformed -= normalize(objectNormal) * coverW * uCoverShrink;",
            ].join("\n"),
          );
      };
      m.customProgramCacheKey = () => "cover-shrink-v2";
      m.needsUpdate = true;
    });
    n++;
  });
  return n;
}
