import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // スマホから同じWi-FiのPCのIPで開発サーバーを開くため（docs/setup.mdの「スマホで撮影する」）。
  // 許可しないと開発用の接続が拒まれ、画面が動かない。IPはWi-Fiごとに変わるので、プライベートIPの範囲で許す
  allowedDevOrigins: ["10.*.*.*", "172.*.*.*", "192.168.*.*"],
};

export default nextConfig;
