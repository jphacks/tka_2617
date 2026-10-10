"use client";

import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";
import { Mesh } from "three";
import { AvatarFrame } from "@/components/avatar-frame";

const tshirtUrl = "/models/tshirt.glb";

function TshirtEditor() {
  const { nodes } = useGLTF(tshirtUrl);
  const meshes = Object.values(nodes).filter(
    (node): node is Mesh => node instanceof Mesh,
  );
  // morphTargetInfluencesは、シェイプキーの番号順に並べた配列で渡す
  const names = Object.entries(meshes[0]?.morphTargetDictionary ?? {})
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name);
  const [weights, setWeights] = useState<Record<string, number>>({});

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
        <legend className="mb-2 text-[15px] font-semibold">シェイプキー</legend>
        {names.map((name) => (
          <label key={name} className="flex flex-col gap-1 text-[13px]">
            <span className="flex justify-between">
              <span>{name}</span>
              <span className="text-description tabular-nums">
                {(weights[name] ?? 0).toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={weights[name] ?? 0}
              onChange={(event) => {
                const weight = event.currentTarget.valueAsNumber;
                setWeights((current) => ({ ...current, [name]: weight }));
              }}
              className="accent-main"
            />
          </label>
        ))}
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
