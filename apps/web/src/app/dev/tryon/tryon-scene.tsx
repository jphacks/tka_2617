"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Mesh, type Object3D } from "three";
import { setMorph } from "@/lib/morph";
import {
  buildBodyBVH,
  shirtTopology,
  updatePush,
  type PushStats,
} from "@/lib/push-out";

const AVATAR_URL = "/models/avatar_male.glb";
const TSHIRT_URL = "/models/tshirt_male.glb";

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
  /** 体のmorph（体型キー） */
  bodyMorphs: Record<string, number>;
  /** Tシャツのmorph（体型キー＋サイズキー） */
  shirtMorphs: Record<string, number>;
  /** 服が小さすぎるときはfalse。体だけを表示する */
  showShirt: boolean;
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
  onPushStats,
  benchmarkRequest,
  onBenchmark,
}: Props) {
  const avatar = useGLTF(AVATAR_URL);
  const shirt = useGLTF(TSHIRT_URL);
  const bodyMesh = useMemo(() => firstMesh(avatar.scene), [avatar.scene]);
  const shirtMesh = useMemo(() => firstMesh(shirt.scene), [shirt.scene]);
  const topo = useMemo(() => shirtTopology(shirtMesh), [shirtMesh]);

  useEffect(() => {
    applyMorphs(avatar.scene, bodyMorphs);
  }, [avatar.scene, bodyMorphs]);
  useEffect(() => {
    applyMorphs(shirt.scene, shirtMorphs);
  }, [shirt.scene, shirtMorphs]);

  // 体のBVHは体型・身長が変わったときだけ作り直す（morphを当てた後なので上のeffectより後に置く）
  const bodyBVH = useRef<ReturnType<typeof buildBodyBVH> | null>(null);
  const bvhMorphs = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!showShirt) return;
    const timer = setTimeout(() => {
      if (!bodyBVH.current || bvhMorphs.current !== bodyMorphs) {
        bodyBVH.current?.geometry.dispose();
        bodyBVH.current = buildBodyBVH(bodyMesh);
        bvhMorphs.current = bodyMorphs;
      }
      onPushStats?.(updatePush(shirtMesh, bodyBVH.current, topo));
    }, PUSH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [
    bodyMesh,
    shirtMesh,
    topo,
    showShirt,
    shirtMorphs,
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
    </>
  );
}

export default function TryOnScene(props: Props) {
  return (
    <Canvas camera={{ position: [0, 1.3, 2.4], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={1.6} />
      <directionalLight position={[-2, 2, -2]} intensity={0.6} />
      <Suspense fallback={null}>
        <Models {...props} />
      </Suspense>
      <OrbitControls target={[0, 1.15, 0]} />
    </Canvas>
  );
}

useGLTF.preload(AVATAR_URL);
useGLTF.preload(TSHIRT_URL);
