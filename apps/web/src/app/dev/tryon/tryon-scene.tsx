"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ComponentRef,
  type RefObject,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Mesh, type Object3D } from "three";
import { setMorph } from "@/lib/morph";
import { stackHems } from "@/lib/hem-stack";
import {
  buildBodyBVH,
  buildGarmentCollider,
  shirtTopology,
  updatePush,
  type PushStats,
} from "@/lib/push-out";

const AVATAR_URL = "/models/avatar_male.glb";
const TSHIRT_URL = "/models/tshirt_male.glb";
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
  /** Tシャツのmorph（体型キー＋サイズキー） */
  shirtMorphs: Record<string, number>;
  /** 服が小さすぎるときはfalse。体だけを表示する */
  showShirt: boolean;
  /** ズボンのmorph（体型キー＋身長キー＋サイズキー） */
  trouserMorphs: Record<string, number>;
  /** ズボンを着ないとき、小さすぎるときはfalse */
  showTrousers: boolean;
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

function Models({
  bodyMorphs,
  shirtMorphs,
  showShirt,
  trouserMorphs,
  showTrousers,
  onPushStats,
  benchmarkRequest,
  onBenchmark,
}: Omit<Props, "heightScale">) {
  const avatar = useGLTF(AVATAR_URL);
  const shirt = useGLTF(TSHIRT_URL);
  const trousers = useGLTF(TROUSERS_URL);
  const bodyMesh = useMemo(() => firstMesh(avatar.scene), [avatar.scene]);
  const shirtMesh = useMemo(() => firstMesh(shirt.scene), [shirt.scene]);
  const trouserMesh = useMemo(
    () => firstMesh(trousers.scene),
    [trousers.scene],
  );
  const topo = useMemo(() => shirtTopology(shirtMesh), [shirtMesh]);
  const trouserTopo = useMemo(() => shirtTopology(trouserMesh), [trouserMesh]);

  useEffect(() => {
    applyMorphs(avatar.scene, bodyMorphs);
  }, [avatar.scene, bodyMorphs]);
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
    if (!showShirt && !showTrousers) return;
    const timer = setTimeout(() => {
      if (!bodyBVH.current || bvhMorphs.current !== bodyMorphs) {
        bodyBVH.current?.geometry.dispose();
        bodyBVH.current = buildBodyBVH(bodyMesh);
        bvhMorphs.current = bodyMorphs;
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
        onPushStats?.(updatePush(shirtMesh, bodyBVH.current, topo, { layers }));
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
    bodyMorphs,
    onPushStats,
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
useGLTF.preload(TSHIRT_URL);
useGLTF.preload(TROUSERS_URL);
