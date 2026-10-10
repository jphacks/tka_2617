import type { ReactNode } from "react";

// 読み込み中も同じ大きさの枠を出し、読み終わったときに下の内容がずれないようにする
export function AvatarFrame({
  children,
  loading = false,
}: {
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex aspect-3/4 w-full touch-none items-center justify-center overflow-hidden rounded bg-surface">
      {loading ? (
        <span className="text-xs text-muted">読み込み中…</span>
      ) : (
        children
      )}
    </div>
  );
}
