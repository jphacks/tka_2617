"use client";

import { categoryLabels } from "@/lib/garment-category";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { GarmentView, Season } from "@pitari/api";
import { CameraIcon } from "@/components/icons";
import { GarmentMeasurements } from "@/components/garment-measurements";
import { MeasurementProgress } from "@/components/measurement-progress";
import { garmentPhotoUrl } from "@/lib/garment-photo";
import { prepareBackPhoto, uploadBackPhoto } from "@/lib/back-photo";
import type { MeasurementProgressState } from "@/lib/measurement-progress";
import { requestJson } from "@/lib/request";

const seasons: { value: Season; label: string }[] = [
  { value: "spring", label: "春" },
  { value: "summer", label: "夏" },
  { value: "autumn", label: "秋" },
  { value: "winter", label: "冬" },
];
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";

type Details = Pick<GarmentView, "purchasedMonth" | "seasons">;

export function GarmentDetail({ id }: { id: string }) {
  const [garment, setGarment] = useState<GarmentView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  // 入力途中の値を消さないよう購入時期の欄は非制御にし、表示を戻すときだけ作り直す
  const [monthInputKey, setMonthInputKey] = useState(0);
  const [progress, setProgress] = useState<MeasurementProgressState | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    requestJson<GarmentView>(`/api/garments/${encodeURIComponent(id)}`)
      .then((data) => {
        if (active) setGarment(data);
      })
      .catch((failure: unknown) => {
        if (active)
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "服を読み込めませんでした",
          );
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  async function saveDetails(values: Partial<Details>) {
    if (!garment) return;
    const previous = garment;
    setGarment({ ...garment, ...values });
    setStatus("保存しています…");
    try {
      await requestJson(`/api/garments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setStatus("保存しました");
    } catch (failure) {
      setGarment(previous);
      setMonthInputKey((key) => key + 1);
      setStatus(
        failure instanceof Error ? failure.message : "保存できませんでした",
      );
    }
  }

  async function captureBack(file: File) {
    if (!garment) return;
    setStatus("");
    try {
      const back = await prepareBackPhoto(
        file,
        garment.category,
        (percent, nextPercent, label, estimatedMs) => {
          setProgress({
            percent,
            nextPercent,
            label,
            estimatedMs,
            startedAt: performance.now(),
          });
        },
      );
      await uploadBackPhoto(id, back);
      setGarment(
        await requestJson<GarmentView>(
          `/api/garments/${encodeURIComponent(id)}`,
        ),
      );
      setStatus(
        back.cutoutImage
          ? "裏面を保存しました"
          : "裏面を保存しました。服を切り抜けなかったため、写真のまま表示します",
      );
    } catch (failure) {
      setStatus(
        failure instanceof Error
          ? failure.message
          : "裏面を保存できませんでした",
      );
    } finally {
      setProgress(null);
    }
  }

  if (loadError)
    return (
      <main role="alert" className="px-4 py-6 text-sm">
        <p>{loadError}</p>
        <button
          className={`mt-3 min-h-11 rounded border border-main px-4 ${focusRing}`}
          onClick={() => {
            setLoadError("");
            setAttempt((previous) => previous + 1);
          }}
        >
          再読み込み
        </button>
      </main>
    );
  if (!garment)
    return (
      <p role="status" className="px-4 py-6 text-sm text-description">
        読み込み中…
      </p>
    );

  const front = garmentPhotoUrl(garment, "front");
  const back = garmentPhotoUrl(garment, "back");
  const busy = progress !== null;
  const backInput = (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      disabled={busy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void captureBack(file);
      }}
    />
  );

  return (
    <main className="px-4 pt-5 pb-9 motion-safe:animate-fade-in">
      {progress && <MeasurementProgress progress={progress} />}

      <div className="grid grid-cols-2 gap-3">
        <GarmentFace label="表" photo={front} />
        <GarmentFace
          label="裏"
          photo={back}
          empty={
            <label className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-sub transition hover:text-main has-focus-visible:outline-2 has-focus-visible:outline-main">
              <CameraIcon className="size-6" strokeWidth={1.6} />
              <span className="text-xs font-semibold">裏面を撮影</span>
              {backInput}
            </label>
          }
        />
      </div>
      {back && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          <label className="col-start-2 flex min-h-11 cursor-pointer items-center justify-center text-xs text-description underline has-focus-visible:outline-2 has-focus-visible:outline-main">
            裏面を撮り直す
            {backInput}
          </label>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[11px] tracking-[0.12em] text-sub">
          {categoryLabels[garment.category]}
        </p>
        <h2 className="mt-1 text-lg font-semibold wrap-anywhere">
          {garment.name || "名前なし"}
        </h2>
      </div>

      <dl className="mt-5 border-t border-line">
        <div className="flex min-h-15 items-center justify-between gap-4 border-b border-line py-3">
          <dt className="text-[13px] text-description">
            <label htmlFor="purchased-month">購入時期</label>
          </dt>
          <dd className="flex items-center gap-2">
            <input
              key={monthInputKey}
              id="purchased-month"
              type="month"
              placeholder="2026-04"
              defaultValue={garment.purchasedMonth ?? ""}
              className={`h-10 rounded-md bg-surface px-3 text-sm tabular-nums ${focusRing}`}
              onChange={(event) => {
                const value = event.target.value;
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
                  void saveDetails({ purchasedMonth: value });
              }}
            />
            {garment.purchasedMonth && (
              <button
                aria-label="購入時期を未設定に戻す"
                className={`flex size-8 items-center justify-center rounded-full text-sub hover:text-main ${focusRing}`}
                onClick={() => {
                  setMonthInputKey((key) => key + 1);
                  void saveDetails({ purchasedMonth: null });
                }}
              >
                ×
              </button>
            )}
          </dd>
        </div>
        <div className="flex min-h-15 items-center justify-between gap-4 border-b border-line py-3">
          <dt className="text-[13px] text-description" id="seasons-label">
            時期
          </dt>
          <dd
            role="group"
            aria-labelledby="seasons-label"
            className="flex gap-2.5"
          >
            {seasons.map(({ value, label }) => {
              const selected = garment.seasons.includes(value);
              return (
                <button
                  key={value}
                  aria-pressed={selected}
                  className={`flex size-10 items-center justify-center rounded-full text-[13px] transition active:scale-95 ${focusRing} ${selected ? "bg-main font-semibold text-white" : "border border-line text-sub hover:border-main hover:text-main"}`}
                  onClick={() => {
                    void saveDetails({
                      seasons: seasons
                        .map((season) => season.value)
                        .filter((season) =>
                          season === value
                            ? !selected
                            : garment.seasons.includes(season),
                        ),
                    });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </dd>
        </div>
      </dl>
      <p role="status" className="mt-2 min-h-5 text-xs text-sub">
        {status}
      </p>

      <section className="mt-4">
        <h3 className="text-[13px] font-semibold">サイズ</h3>
        <GarmentMeasurements
          category={garment.category}
          measurements={garment.measurements}
        />
        <Link
          href="/capture#saved-garments"
          className="mt-3 flex min-h-11 items-center text-xs text-description underline"
        >
          寸法を編集する
        </Link>
      </section>
    </main>
  );
}

function GarmentFace({
  label,
  photo,
  empty,
}: {
  label: string;
  photo: string | undefined;
  empty?: ReactNode;
}) {
  return (
    <figure className="min-w-0">
      <div className="relative aspect-3/4 overflow-hidden rounded bg-surface">
        {photo ? (
          <svg
            viewBox="0 0 300 400"
            className="size-full"
            role="img"
            aria-label={`${label}の写真`}
          >
            <image
              href={photo}
              x="18"
              y="18"
              width="264"
              height="364"
              preserveAspectRatio="xMidYMid meet"
            />
          </svg>
        ) : (
          <>
            <span className="absolute top-3 left-3 size-5 border-t-2 border-l-2 border-frame-mark" />
            <span className="absolute top-3 right-3 size-5 border-t-2 border-r-2 border-frame-mark" />
            <span className="absolute bottom-3 left-3 size-5 border-b-2 border-l-2 border-frame-mark" />
            <span className="absolute right-3 bottom-3 size-5 border-r-2 border-b-2 border-frame-mark" />
            {empty ?? (
              <span className="flex size-full items-center justify-center text-xs text-muted">
                写真なし
              </span>
            )}
          </>
        )}
      </div>
      <figcaption className="mt-2 text-center text-[11px] font-semibold tracking-[0.3em] text-sub">
        {label}
      </figcaption>
    </figure>
  );
}
