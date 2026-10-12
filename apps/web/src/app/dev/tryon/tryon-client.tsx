"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import tshirtHeightJson from "@/../public/models/tshirt_male_height.json";
import type { AntiClipMode, Benchmark } from "@/app/dev/tryon/tryon-scene";
import {
  BUILD_LABELS,
  BUILDS,
  buildKeyValues,
  fitAt,
  fitStatus,
  GarmentSchema,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  heightKeyValues,
  HeightTableSchema,
  MEASUREMENT_KEYS,
  MEASUREMENT_LABELS,
  sizeKeyValues,
  STRETCH_RATIO,
  tshirtMeasurements,
  type Build,
  type Measurements,
} from "@/lib/garment";
import type { PushStats } from "@/lib/push-out";

// three.jsはブラウザでだけ動かす
const TryOnScene = dynamic(() => import("@/app/dev/tryon/tryon-scene"), {
  ssr: false,
});

// Blenderが書き出した表。小さいので、取りに行かずにバンドルに入れる
const heightTable = HeightTableSchema.parse(tshirtHeightJson);

const ANTI_CLIP_MODES: [AntiClipMode, string][] = [
  ["none", "なし"],
  ["shrink", "A：服の下の体を縮める"],
  ["push", "E：服を体の外へ押し出す（試作）"],
  ["both", "A＋E"],
];

/** 確認用の服データ（チーム共通の形式・仮） */
const SAMPLE_GARMENT = GarmentSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  name: "白いTシャツ",
  category: "short_sleeve_top",
  measurements: {
    shoulderWidthCm: 45,
    sleeveLengthCm: 22,
    bodyWidthCm: 50,
    bodyLengthCm: 70,
    waistCm: null,
    hipCm: null,
    thighWidthCm: null,
    riseCm: null,
    inseamCm: null,
    hemWidthCm: null,
  },
  measurementVersion: "df2-a4-midpoint-v1",
});

type Inputs = Record<keyof Measurements, string>;

function toInputs(m: Measurements, digits = 0): Inputs {
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((k) => [k, m[k].toFixed(digits)]),
  ) as Inputs;
}

export default function TryOnClient() {
  const [build, setBuild] = useState<Build>("standard");
  const [heightInput, setHeightInput] = useState(() =>
    heightTable.standard_cm.toFixed(1),
  );
  const [input, setInput] = useState<Inputs>(() =>
    toInputs(tshirtMeasurements(SAMPLE_GARMENT)),
  );
  const [mode, setMode] = useState<AntiClipMode>("push");
  const [pushStats, setPushStats] = useState<PushStats | null>(null);
  const [benchmarkRequest, setBenchmarkRequest] = useState(0);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

  // 入力を4項目の寸法にする（空欄や数値でないものは不正）
  const target = useMemo<Measurements | null>(() => {
    const ok = MEASUREMENT_KEYS.every(
      (k) => input[k].trim() !== "" && Number.isFinite(Number(input[k])),
    );
    return ok
      ? (Object.fromEntries(
          MEASUREMENT_KEYS.map((k) => [k, Number(input[k])]),
        ) as Measurements)
      : null;
  }, [input]);

  // 範囲外や数値でない身長は、標準の身長で表示する
  const heightValue = Number(heightInput);
  const isHeightValid =
    heightInput.trim() !== "" &&
    heightValue >= HEIGHT_MIN_CM &&
    heightValue <= HEIGHT_MAX_CM;
  const heightCm = isHeightValid ? heightValue : heightTable.standard_cm;

  const fit = useMemo(
    () => fitAt(build, heightCm, heightTable),
    [build, heightCm],
  );
  const size = useMemo(
    () => (target ? sizeKeyValues(target, fit, heightTable) : null),
    [fit, target],
  );
  const status = target ? fitStatus(target, fit) : null;

  const bodyMorphs = useMemo(
    () => ({
      ...buildKeyValues(build),
      ...heightKeyValues(heightCm, heightTable),
    }),
    [build, heightCm],
  );
  const shirtMorphs = useMemo(
    () => ({ ...bodyMorphs, ...(size ?? {}) }),
    [bodyMorphs, size],
  );

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">試着確認</h1>
        </div>
      </header>

      <main className="flex flex-col gap-5 px-4 py-5 text-[13px]">
        <div className="relative aspect-3/4 w-full touch-none overflow-hidden rounded bg-[#e9e9ee]">
          <TryOnScene
            bodyMorphs={bodyMorphs}
            shirtMorphs={shirtMorphs}
            mode={mode}
            showShirt={status !== "tooSmall"}
            onPushStats={setPushStats}
            benchmarkRequest={benchmarkRequest}
            onBenchmark={setBenchmark}
          />
          {status === "tooSmall" && (
            <p className="absolute inset-x-4 top-4 rounded bg-white/90 px-3 py-2 text-center text-[13px] font-semibold">
              この服は小さすぎます
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">身長</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={HEIGHT_MIN_CM}
                max={HEIGHT_MAX_CM}
                step={0.5}
                value={heightInput}
                onChange={(e) => {
                  setHeightInput(e.target.value);
                }}
                aria-invalid={!isHeightValid}
                className="w-20 rounded border border-line px-2 py-1 text-right text-base tabular-nums aria-invalid:border-red-600"
              />
              cm
            </span>
          </span>
          {!isHeightValid && (
            <span className="text-right text-xs text-red-600">
              {HEIGHT_MIN_CM}〜{HEIGHT_MAX_CM}cmで入力してください
            </span>
          )}
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 text-[15px] font-semibold">体型</legend>
          {BUILDS.map((b) => (
            <label key={b} className="flex items-center gap-2">
              <input
                type="radio"
                name="build"
                value={b}
                checked={build === b}
                onChange={() => {
                  setBuild(b);
                }}
                className="accent-main"
              />
              {BUILD_LABELS[b]}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold">実寸（cm）</legend>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs text-description">
                <th className="px-1 py-0.5 font-normal"></th>
                <th className="px-1 py-0.5 font-normal">入力</th>
                <th className="px-1 py-0.5 font-normal">基準</th>
                <th className="px-1 py-0.5 font-normal">キー</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {MEASUREMENT_KEYS.map((k) => (
                <tr key={k}>
                  <td className="px-1 py-0.5">{MEASUREMENT_LABELS[k]}</td>
                  <td className="px-1 py-0.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      value={input[k]}
                      aria-label={MEASUREMENT_LABELS[k]}
                      onChange={(e) => {
                        const value = e.target.value;
                        setInput((s) => ({ ...s, [k]: value }));
                      }}
                      className="w-20 rounded border border-line px-2 py-1 text-right text-base"
                    />
                  </td>
                  <td className="px-1 py-0.5">{fit.base[k].toFixed(1)}</td>
                  <td className="px-1 py-0.5">
                    {size ? size[`size_${k}`].toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!target && <p className="text-red-600">数値を入力してください</p>}
          {status === "tight" && (
            <p>
              <span className="rounded border border-main px-2 py-0.5 text-[11px] font-semibold">
                タイト
              </span>
            </p>
          )}
          {status === "tooSmall" && (
            <p className="text-red-600">
              身幅が体より{Math.round(STRETCH_RATIO * 100)}
              %以上小さいので、着せずに表示しています
            </p>
          )}
          <p className="text-xs text-muted tabular-nums">
            体の身幅 {fit.bodyWidth.toFixed(1)}cm
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setInput(toInputs(fit.base, 1));
              }}
              className="rounded border border-main px-3 py-1.5 text-xs font-semibold"
            >
              この体型の基準寸法にする
            </button>
            <button
              type="button"
              onClick={() => {
                setInput(toInputs(tshirtMeasurements(SAMPLE_GARMENT)));
              }}
              className="rounded border border-main px-3 py-1.5 text-xs font-semibold"
            >
              服データ「{SAMPLE_GARMENT.name}」
            </button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 text-[15px] font-semibold">
            突き抜け対策
          </legend>
          {ANTI_CLIP_MODES.map(([m, label]) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                }}
                className="accent-main"
              />
              {label}
            </label>
          ))}
          {pushStats &&
            status !== "tooSmall" &&
            (mode === "push" || mode === "both") && (
              <p className="text-xs text-muted tabular-nums">
                押し出し{pushStats.pushed}頂点・最大
                {pushStats.maxCm.toFixed(2)}cm・{pushStats.ms.toFixed(1)}ms
              </p>
            )}
        </fieldset>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">計算時間</h2>
          <button
            type="button"
            onClick={() => {
              setBenchmark(null);
              setBenchmarkRequest((n) => n + 1);
            }}
            className="self-start rounded border border-main px-3 py-1.5 text-xs font-semibold"
          >
            10回測る
          </button>
          {benchmark && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt>押し出し（E）</dt>
              <dd>
                中央値{benchmark.pushMedianMs.toFixed(1)}ms・最大
                {benchmark.pushMaxMs.toFixed(1)}ms
              </dd>
              <dt>体のBVH</dt>
              <dd>
                中央値{benchmark.bodyBvhMedianMs.toFixed(1)}ms・最大
                {benchmark.bodyBvhMaxMs.toFixed(1)}ms
              </dd>
            </dl>
          )}
        </section>

        <p className="text-xs text-muted">
          キーの値は、キーどうしの影響を打ち消して「実寸−その体型・身長の基準寸法」になるよう決めています（1.0＝+1cm）。
        </p>
      </main>
    </>
  );
}
