import type { MetadataRoute } from "next";

// スマホのホーム画面に追加して、アプリのように使うため（docs/adr/0003-pwa.md）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pitari",
    short_name: "Pitari",
    description:
      "部屋の服を撮影してクローゼットに保存し、体型を変えられるアバターに着せるアプリ",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Androidは機種ごとに丸や角丸に切り抜くので、袖が欠けないよう絵を87.5%に縮めた画像を使う
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
