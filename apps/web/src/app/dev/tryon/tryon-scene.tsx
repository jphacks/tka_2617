"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentRef,
  type RefObject,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import {
  BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { setMorph } from "@/lib/morph";
import { stackHems } from "@/lib/hem-stack";
import { bodyInSleeves } from "@/lib/sleeve-drape";
import {
  buildBodyBVH,
  buildGarmentCollider,
  shirtTopology,
  updatePush,
  type PushStats,
} from "@/lib/push-out";

const AVATAR_URL = "/models/avatar_male.glb";
const TROUSERS_URL = "/models/trousers_male.glb";
// ズボンで覆われる体の印（_cover）はまだ無いので、頂点の間から体が出ていないかは確かめない
const NO_COVERED = new Uint32Array(0);

// 入力のたびに押し出しを計算すると、スマホでは1回0.3〜0.4秒止まる。入力が止まってから計算する
const PUSH_DELAY_MS = 300;

/** 計算時間の計測結果（ms）。体のBVHは体型・身長が変わるたび、押し出しは服・体が変わるたびに計算する */
export type Benchmark = {
  runs: number;
  bodyBvhMedianMs: number;
  bodyBvhMaxMs: number;
  pushMedianMs: number;
  pushMaxMs: number;
};

const BENCHMARK_RUNS = 10;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

type Props = {
  /** 身長÷標準の身長。体の大きさに合わせてカメラを動かす */
  heightScale: number;
  /** 体のmorph（体型キー） */
  bodyMorphs: Record<string, number>;
  /** 上の服（Tシャツか長袖）のglb */
  shirtUrl: string;
  /** 上の服のmorph（体型キー＋身長キー＋サイズキー） */
  shirtMorphs: Record<string, number>;
  /** 服が小さすぎるときはfalse。体だけを表示する */
  showShirt: boolean;
  /** ズボンのmorph（体型キー＋身長キー＋サイズキー） */
  trouserMorphs: Record<string, number>;
  /** ズボンを着ないとき、小さすぎるときはfalse */
  showTrousers: boolean;
  /** 肌の色。肌のテクスチャは明暗だけなので、この色を掛ける */
  skinColor: string;
  /** 髪のglb（public/presets/presets.json）。nullなら髪なし */
  hairUrl: string | null;
  /** 髪の色。髪のテクスチャも明暗だけなので、この色を掛ける */
  hairColor: string;
  /** 靴のglb。nullなら裸足 */
  shoesUrl: string | null;
  onPushStats?: (s: PushStats) => void;
  /** 増えるたびに、今の服と体で計算時間をBENCHMARK_RUNS回測る */
  benchmarkRequest: number;
  onBenchmark?: (b: Benchmark) => void;
};

function applyMorphs(root: Object3D, morphs: Record<string, number>) {
  for (const [name, value] of Object.entries(morphs)) {
    if (setMorph(root, name, value) === 0)
      console.warn(`morph target がありません: ${name}`);
  }
}

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((o) => {
    if (!found && o instanceof Mesh) found = o;
  });
  if (!found) throw new Error("メッシュがありません");
  return found;
}

/**
 * 体の_hideが1の所を描かない（靴の中の足、袖の中に隠れる腕、袖から出る親指）。_hideはJSで毎回書き換える。
 * 押し出しの計算に使う体の形は変えない
 */
function hideBodyParts(material: MeshStandardMaterial) {
  material.needsUpdate = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      `attribute float _hide;
varying float vHide;
void main() {
  vHide = _hide;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `varying float vHide;
void main() {
  if (vHide > 0.5) discard;`,
    );
  };
}

/** 体の_hide属性（無ければ0で作る） */
function hideAttribute(body: Mesh): BufferAttribute {
  const geometry = body.geometry;
  if (!geometry.hasAttribute("_hide")) {
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "_hide",
      new BufferAttribute(new Float32Array(count), 1),
    );
  }
  return geometry.getAttribute("_hide") as BufferAttribute;
}

/** 袖の中に隠れる腕を描かないのは、腕に沿った位置（縫い目0 → 袖口1）がここまでの袖の中だけ（袖口からのぞいたときに腕が消えて見えないように） */
const HIDE_SLEEVE_MAX = 0.85;

/** 髪・靴のプリセット。体と同じ体型キー・身長キーを入れると体に重なる */
function PresetModel({
  url,
  morphs,
  color,
}: {
  url: string;
  morphs: Record<string, number>;
  color?: string;
}) {
  const gltf = useGLTF(url);
  useEffect(() => {
    applyMorphs(gltf.scene, morphs);
  }, [gltf.scene, morphs]);
  useEffect(() => {
    if (!color) return;
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshStandardMaterial)
        o.material.color.set(color);
    });
  }, [gltf.scene, color]);
  return <primitive object={gltf.scene} />;
}

function Models({
  bodyMorphs,
  shirtUrl,
  shirtMorphs,
  showShirt,
  trouserMorphs,
  showTrousers,
  skinColor,
  hairUrl,
  hairColor,
  shoesUrl,
  onPushStats,
  benchmarkRequest,
  onBenchmark,
}: Omit<Props, "heightScale">) {
  const avatar = useGLTF(AVATAR_URL);
  const shirt = useGLTF(shirtUrl);
  const trousers = useGLTF(TROUSERS_URL);
  const bodyMesh = useMemo(() => firstMesh(avatar.scene), [avatar.scene]);
  const shirtMesh = useMemo(() => firstMesh(shirt.scene), [shirt.scene]);
  const trouserMesh = useMemo(
    () => firstMesh(trousers.scene),
    [trousers.scene],
  );
  const topo = useMemo(() => shirtTopology(shirtMesh), [shirtMesh]);
  const trouserTopo = useMemo(() => shirtTopology(trouserMesh), [trouserMesh]);

  // 体の描かない所：靴の中の足、袖の中に隠れる腕（押し出しのたびに選ぶ）
  useEffect(() => {
    const material = bodyMesh.material;
    if (material instanceof MeshStandardMaterial) hideBodyParts(material);
  }, [bodyMesh]);
  const armsHidden = useRef<number[]>([]);
  const updateHide = useCallback(() => {
    const hide = hideAttribute(bodyMesh);
    const h = hide.array as Float32Array;
    h.fill(0);
    const geometry = bodyMesh.geometry;
    if (shoesUrl !== null && geometry.hasAttribute("_shoe")) {
      const shoe = geometry.getAttribute("_shoe");
      for (let i = 0; i < shoe.count; i++) if (shoe.getX(i) > 0.5) h[i] = 1;
    }
    for (const i of armsHidden.current) h[i] = 1;
    hide.needsUpdate = true;
  }, [bodyMesh, shoesUrl]);
  useEffect(() => {
    updateHide();
  }, [updateHide]);
  useEffect(() => {
    const material = bodyMesh.material;
    if (material instanceof MeshStandardMaterial) material.color.set(skinColor);
  }, [bodyMesh, skinColor]);
  // 長袖が手にかぶさるときは、親指を曲げて袖の中に収める（かぶさる度合いに合わせる）
  const avatarMorphs = useMemo(() => {
    const drape = Object.entries(shirtMorphs)
      .filter(([name]) => name.startsWith("drape_"))
      .reduce((sum, [, value]) => sum + value, 0);
    return { ...bodyMorphs, thumb_in: showShirt ? Math.min(drape, 1) : 0 };
  }, [bodyMorphs, shirtMorphs, showShirt]);
  useEffect(() => {
    applyMorphs(avatar.scene, avatarMorphs);
  }, [avatar.scene, avatarMorphs]);
  useEffect(() => {
    applyMorphs(shirt.scene, shirtMorphs);
  }, [shirt.scene, shirtMorphs]);
  useEffect(() => {
    applyMorphs(trousers.scene, trouserMorphs);
  }, [trousers.scene, trouserMorphs]);

  // 体のBVHは体型・身長が変わったときだけ作り直す（morphを当てた後なので上のeffectより後に置く）
  const bodyBVH = useRef<ReturnType<typeof buildBodyBVH> | null>(null);
  const bvhMorphs = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!showShirt) {
      armsHidden.current = [];
      updateHide();
    }
    if (!showShirt && !showTrousers) return;
    const timer = setTimeout(() => {
      if (!bodyBVH.current || bvhMorphs.current !== avatarMorphs) {
        bodyBVH.current?.geometry.dispose();
        bodyBVH.current = buildBodyBVH(bodyMesh);
        bvhMorphs.current = avatarMorphs;
      }
      if (showTrousers) {
        updatePush(trouserMesh, bodyBVH.current, trouserTopo, {
          covered: NO_COVERED,
          prepare: stackHems,
        });
      }
      if (showShirt) {
        // Tシャツはズボンの上に着るので、押し出したズボンの外へも押し出す
        const layers = showTrousers ? [buildGarmentCollider(trouserMesh)] : [];
        // 長袖は腕に沿った位置（_sleeve）を持つ。袖の中の腕・手（ひじ・親指など）も、袖の面の間から出さない
        const sleeve = shirtMesh.geometry.hasAttribute("_sleeve")
          ? shirtMesh.geometry.getAttribute("_sleeve").array
          : null;
        armsHidden.current = [];
        onPushStats?.(
          updatePush(shirtMesh, bodyBVH.current, topo, {
            layers,
            ...(sleeve && {
              coveredAfterPrepare: (
                pos: Float32Array,
                bodyPos: Float32Array,
              ) => {
                armsHidden.current = bodyInSleeves(
                  pos,
                  sleeve,
                  bodyPos,
                  HIDE_SLEEVE_MAX,
                );
                return bodyInSleeves(pos, sleeve, bodyPos);
              },
            }),
          }),
        );
        updateHide();
        for (const layer of layers) layer.geometry.dispose();
      }
    }, PUSH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [
    bodyMesh,
    shirtMesh,
    trouserMesh,
    topo,
    trouserTopo,
    showShirt,
    showTrousers,
    shirtMorphs,
    trouserMorphs,
    avatarMorphs,
    onPushStats,
    updateHide,
  ]);

  useEffect(() => {
    if (benchmarkRequest === 0 || !bodyBVH.current) return;
    const bvhMs: number[] = [];
    const pushMs: number[] = [];
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      const t0 = performance.now();
      buildBodyBVH(bodyMesh).geometry.dispose();
      bvhMs.push(performance.now() - t0);
      pushMs.push(updatePush(shirtMesh, bodyBVH.current, topo).ms);
    }
    onBenchmark?.({
      runs: BENCHMARK_RUNS,
      bodyBvhMedianMs: median(bvhMs),
      bodyBvhMaxMs: Math.max(...bvhMs),
      pushMedianMs: median(pushMs),
      pushMaxMs: Math.max(...pushMs),
    });
    // 計測はボタンを押したときだけ。服や体が変わっても測り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkRequest]);

  return (
    <>
      <primitive object={avatar.scene} />
      {showShirt && <primitive object={shirt.scene} />}
      {showTrousers && <primitive object={trousers.scene} />}
      {/* 髪・靴を選び直しても、読み込み中に体と服が消えないよう、それぞれで待つ */}
      {hairUrl && (
        <Suspense fallback={null}>
          <PresetModel url={hairUrl} morphs={bodyMorphs} color={hairColor} />
        </Suspense>
      )}
      {shoesUrl && (
        <Suspense fallback={null}>
          <PresetModel url={shoesUrl} morphs={bodyMorphs} />
        </Suspense>
      )}
    </>
  );
}

// ズボンの裾まで見えるよう、全身が枠に収まる位置にする
const CAMERA_POSITION = [0, 1.0, 3.6] as const;
const CAMERA_TARGET = [0, 0.88, 0] as const;

/** 体は身長に比例して大きくなるので、カメラの位置と注視点も同じ比率で動かす */
function CameraRig({
  scale,
  controls,
}: {
  scale: number;
  controls: RefObject<ComponentRef<typeof OrbitControls> | null>;
}) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const [px, py, pz] = CAMERA_POSITION;
    const [tx, ty, tz] = CAMERA_TARGET;
    camera.position.set(px * scale, py * scale, pz * scale);
    controls.current?.target.set(tx * scale, ty * scale, tz * scale);
    controls.current?.update();
  }, [camera, controls, scale]);
  return null;
}

export default function TryOnScene({ heightScale, ...props }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  return (
    <Canvas camera={{ position: [...CAMERA_POSITION], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={1.6} />
      <directionalLight position={[-2, 2, -2]} intensity={0.6} />
      <Suspense fallback={null}>
        <Models {...props} />
      </Suspense>
      <OrbitControls ref={controls} target={[...CAMERA_TARGET]} />
      <CameraRig scale={heightScale} controls={controls} />
    </Canvas>
  );
}

useGLTF.preload(AVATAR_URL);
useGLTF.preload(TROUSERS_URL);
