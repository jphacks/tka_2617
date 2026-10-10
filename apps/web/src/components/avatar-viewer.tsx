"use client";

import dynamic from "next/dynamic";
import { AvatarFrame } from "@/components/avatar-frame";

// ssr: falseはServer Componentでは使えないため、このClient Componentを挟む
const AvatarCanvas = dynamic(() => import("@/components/avatar-canvas"), {
  ssr: false,
  loading: () => <AvatarFrame loading />,
});

export function AvatarViewer() {
  return <AvatarCanvas />;
}
