"use client";

import { useEffect, useState } from "react";
import {
  estimateMeasurementProgress,
  type MeasurementProgressState,
} from "@/lib/measurement-progress";

export function MeasurementProgress({
  progress,
}: {
  progress: MeasurementProgressState;
}) {
  const [startedAt] = useState(progress.startedAt);
  const [now, setNow] = useState(progress.startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(performance.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const percent = estimateMeasurementProgress(progress, now);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="服の測定"
    >
      <div className="w-full max-w-80 rounded bg-white px-6 py-7 text-center">
        <div
          className="mx-auto size-8 rounded-full border-2 border-line border-t-main motion-safe:animate-spin"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-medium" role="status">
          {progress.label}
        </p>
        <p className="mt-4 text-3xl font-semibold tabular-nums">
          {percent}
          <span className="ml-1 text-base">%</span>
        </p>
        <p className="mt-1 text-xs text-description">進み具合の目安</p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-label="進み具合の目安"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-main motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: `${String(percent)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-description tabular-nums">
          {seconds}秒経過
        </p>
        {seconds >= 45 && percent < 100 && (
          <p className="mt-2 text-xs leading-relaxed text-description">
            少し時間がかかっています。そのままお待ちください。
          </p>
        )}
      </div>
    </div>
  );
}
