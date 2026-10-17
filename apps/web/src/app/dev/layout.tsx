import { notFound } from "next/navigation";

// /dev の下は開発用の確認ページ。本番（next build）では404にし、next dev のときだけ開く。
// スマホで試すときは、PCの next dev にLANでつなぐ（docs/setup.md）
export default function DevLayout({ children }: LayoutProps<"/dev">) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
