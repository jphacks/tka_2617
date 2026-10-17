"use client";

import Link from "next/link";
import type { Ref } from "react";

const choice =
  "flex w-full flex-col items-start gap-1 rounded border border-line px-4 py-4 text-left";

// 下から出す「追加する」の選択肢。<dialog>のshowModalで開き、Escと背景のタップで閉じる
export function AddSheet({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="add-sheet-title"
      onClick={(event) => {
        // 背景（dialog自身）を押したときだけ閉じ、中身のタップでは閉じない
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-120 rounded-t-2xl bg-white p-0 text-main backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <h2 id="add-sheet-title" className="mb-1 text-base font-bold">
          服を追加する
        </h2>
        <Link
          href="/capture"
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          className={`${choice} transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main`}
        >
          <span className="text-base font-bold">写真で撮る</span>
          <span className="text-[13px] text-description">
            服を広げて撮り、実寸でクローゼットに追加
          </span>
        </Link>
        <button type="button" disabled className={`${choice} text-muted`}>
          <span className="text-base font-bold">ZOZOから追加（準備中）</span>
          <span className="text-[13px]">
            ZOZOTOWNの商品ページのURLを貼り、サイズ表の寸法で追加
          </span>
        </button>
        <form method="dialog" className="self-center">
          <button
            type="submit"
            className="min-h-11 px-2 text-sm text-description focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
          >
            キャンセル
          </button>
        </form>
      </div>
    </dialog>
  );
}
