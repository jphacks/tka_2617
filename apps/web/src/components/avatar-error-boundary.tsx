"use client";

import { catchError, type ErrorInfo } from "next/error";
import { AvatarFrame } from "@/components/avatar-frame";

// 回線が切れたときやWebGLが使えない端末で、画面ごと落ちないよう3D表示の中だけで受け止める
function AvatarErrorFallback(_props: object, { retry }: ErrorInfo) {
  return (
    <AvatarFrame>
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <p className="text-[13px] leading-[1.7] text-description">
          3Dモデルを表示できませんでした。通信状況を確かめて、もう一度お試しください。
        </p>
        <button
          type="button"
          onClick={() => {
            // three.jsを最初の表示で読み込まないよう、ここでも動的に読み込む
            void import("@/components/try-on/try-on-scene")
              .then(({ clearModelCache }) => {
                clearModelCache();
              })
              .finally(retry);
          }}
          className="rounded border border-main px-4 py-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
        >
          もう一度読み込む
        </button>
      </div>
    </AvatarFrame>
  );
}

export const AvatarErrorBoundary = catchError(AvatarErrorFallback);
