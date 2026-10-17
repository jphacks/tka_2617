import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// /dev の下は開発用の確認ページ。本番（next build）では404にし、next dev のときだけ開く。
// スマホで試すときは、PCの next dev にLANでつなぐ（docs/setup.md）
// 型はLayoutPropsを使わずに書く。CIではlintが型の生成（next typegen）より先に走り、LayoutPropsがまだ無いため
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
