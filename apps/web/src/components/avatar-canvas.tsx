"use client";

import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";
import { Mesh } from "three";
import { AvatarFrame } from "@/components/avatar-frame";
import { solveKeys, tshirtMeasure } from "@/lib/solve-keys";

const tshirtUrl = "/models/tshirt.glb";

const partLabels: Record<string, string> = {
  length: "着丈",
  width: "身幅",
  shoulder: "肩幅",
  sleeve: "袖丈",
};

// シェイプキーのRange（−10〜20）に合わせ、基準値の−10〜+20cmまでを受け付ける
const sizeRanges = tshirtMeasure.base.map((base) => ({
  min: Math.round(base) - 10,
  max: Math.round(base) + 20,
}));

const initialInputs = tshirtMeasure.base.map((base) => base.toFixed(1));

function parseSize(index: number, input: string) {
  const sizeCm = Number(input);
  const { min, max } = sizeRanges[index];
  return input !== "" && sizeCm >= min && sizeCm <= max ? sizeCm : undefined;
}

function TshirtEditor() {
  const { nodes } = useGLTF(tshirtUrl);
  const meshes = Object.values(nodes).filter(
    (node): node is Mesh => node instanceof Mesh,
  );
  // morphTargetInfluencesは、シェイプキーの番号順に並べた配列で渡す
  const names = Object.entries(meshes[0]?.morphTargetDictionary ?? {})
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name);
  // 入力途中の値（「70」を打つ途中の「7」など）で形が崩れないよう、
  // 入力欄の文字と、モデルに反映する寸法を分けて持つ
  const [inputs, setInputs] = useState(initialInputs);
  const [targetsCm, setTargetsCm] = useState(() => initialInputs.map(Number));
  const weights = solveKeys(tshirtMeasure, targetsCm);

  function changeInput(index: number, input: string) {
    setInputs((current) => current.map((v, i) => (i === index ? input : v)));
    const targetCm = parseSize(index, input);
    if (targetCm !== undefined) {
      setTargetsCm((current) =>
        current.map((v, i) => (i === index ? targetCm : v)),
      );
    }
  }

  return (
    <>
      <AvatarFrame>
        <Canvas camera={{ position: [0, 1.2, 2], fov: 35 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 3, 2]} intensity={1.6} />
          <directionalLight position={[-2, 2, -2]} intensity={0.6} />
          <Bounds fit clip observe margin={1.2}>
            {meshes.map((mesh) => (
              <mesh
                key={mesh.uuid}
                geometry={mesh.geometry}
                material={mesh.material}
                position={mesh.position}
                quaternion={mesh.quaternion}
                scale={mesh.scale}
                morphTargetDictionary={mesh.morphTargetDictionary}
                morphTargetInfluences={names.map((name) => weights[name] ?? 0)}
              />
            ))}
          </Bounds>
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </AvatarFrame>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[15px] font-semibold">サイズ</legend>
        {tshirtMeasure.keys.map((key, i) => {
          const { min, max } = sizeRanges[i];
          const isApplied = parseSize(i, inputs[i]) !== undefined;
          return (
            <label key={key} className="flex flex-col gap-1 text-[13px]">
              <span className="flex items-center justify-between gap-3">
                <span>{partLabels[key] ?? key}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={max}
                    step={0.1}
                    value={inputs[i]}
                    onChange={(event) => {
                      changeInput(i, event.currentTarget.value);
                    }}
                    aria-invalid={!isApplied}
                    className="w-20 rounded border border-line px-2 py-1.5 text-right text-base tabular-nums focus-visible:outline-2 focus-visible:outline-main aria-invalid:border-red-600"
                  />
                  cm
                </span>
              </span>
              <span
                className={`text-right text-xs ${isApplied ? "text-muted" : "text-red-600"}`}
              >
                {isApplied
                  ? `キー ${weights[key].toFixed(2)}`
                  : `${String(min)}〜${String(max)}cmで入力してください`}
              </span>
            </label>
          );
        })}
      </fieldset>
    </>
  );
}

// three.jsはブラウザのWebGLを使うので、avatar-viewer.tsxからssr: falseで読み込む
export default function AvatarCanvas() {
  return (
    <Suspense fallback={<AvatarFrame loading />}>
      <TshirtEditor />
    </Suspense>
  );
}

useGLTF.preload(tshirtUrl);

// 読み込みの失敗も保存されて投げ直され続けるので、もう一度試す前に消す
export function clearModelCache() {
  useGLTF.clear(tshirtUrl);
}
