"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ColorChoices } from "@/components/try-on/color-choices";
import type { Benchmark } from "@/components/try-on/try-on-scene";
import {
  presets,
  SAMPLE_TROUSERS,
  SHIRT_FRONT_IDS,
  SHIRT_FRONTS,
  TOP_IDS,
  TOPS,
  toInputs,
  toTrouserInputs,
  useTryOn,
} from "@/components/try-on/use-try-on";
import {
  BUILD_LABELS,
  BUILDS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
} from "@/lib/avatar-settings";
import {
  LAYER_WIDTH_CM,
  MEASUREMENT_KEYS,
  MEASUREMENT_LABELS,
  topMeasurements,
} from "@/lib/garment";
import type { PushStats } from "@/lib/push-out";
import {
  TROUSER_KEYS,
  TROUSER_LABELS,
  TROUSER_STRETCH_RATIO,
  trouserMeasurements,
} from "@/lib/trousers";

// three.jsはブラウザでだけ動かす
const TryOnScene = dynamic(() => import("@/components/try-on/try-on-scene"), {
  ssr: false,
});

/** 開発用の確認ページ。本番のアバター画面（/avatar）に無い、実寸の直接入力・キーの値・計算時間を出す */
export default function TryOnClient() {
  const {
    build,
    setBuild,
    heightInput,
    setHeightInput,
    isHeightValid,
    top,
    shirtFront,
    setShirtFront,
    wearInner,
    setWearInner,
    layeredStatus,
    input,
    setInput,
    target,
    fit,
    size,
    status,
    wearTrousers,
    setWearTrousers,
    trouserInput,
    setTrouserInput,
    trouserTarget,
    trouserFit,
    trouserSize,
    trouserStatus,
    hairId,
    setHairId,
    hairColor,
    setHairColor,
    skinColor,
    setSkinColor,
    shoeId,
    setShoeId,
    sockColor,
    setSockColor,
    tooSmall,
    sceneProps,
    selectTop,
  } = useTryOn();
  const [pushStats, setPushStats] = useState<PushStats | null>(null);
  const [benchmarkRequest, setBenchmarkRequest] = useState(0);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

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
            {...sceneProps}
            onPushStats={setPushStats}
            benchmarkRequest={benchmarkRequest}
            onBenchmark={setBenchmark}
          />
          {tooSmall.length > 0 && (
            <p className="absolute inset-x-4 top-4 rounded bg-white/90 px-3 py-2 text-center text-[13px] font-semibold">
              {tooSmall.join("と")}が小さすぎます
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
          <legend className="mb-2 text-[15px] font-semibold">髪型</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {[null, ...presets.hair].map((h) => (
              <button
                key={h?.id ?? "none"}
                type="button"
                aria-pressed={hairId === (h?.id ?? null)}
                onClick={() => {
                  setHairId(h?.id ?? null);
                }}
                className="flex flex-col items-center gap-0.5 rounded border border-line p-1 text-[11px] aria-pressed:border-main aria-pressed:font-semibold"
              >
                {h ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 確認用ページなので最適化しない
                  <img
                    src={h.thumbs.front}
                    alt=""
                    className="aspect-square w-full"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center text-muted">
                    なし
                  </span>
                )}
                {h?.name ?? "なし"}
              </button>
            ))}
          </div>
          <ColorChoices
            label="髪の色"
            colors={presets.hairColors}
            value={hairColor}
            onChange={setHairColor}
          />
          <ColorChoices
            label="肌の色"
            colors={presets.skinColors}
            value={skinColor}
            onChange={setSkinColor}
          />
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0">靴</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[null, ...presets.shoes].map((s) => (
                <label
                  key={s?.id ?? "none"}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="radio"
                    name="shoe"
                    checked={shoeId === (s?.id ?? null)}
                    onChange={() => {
                      setShoeId(s?.id ?? null);
                    }}
                    className="accent-main"
                  />
                  {s?.name ?? "裸足"}
                </label>
              ))}
            </div>
            {shoeId !== null && (
              <ColorChoices
                label="靴下の色"
                colors={presets.sockColors}
                value={sockColor}
                onChange={setSockColor}
              />
            )}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold">
            上の服の実寸（cm）
          </legend>
          <div className="flex gap-4">
            {TOP_IDS.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="top"
                  value={t}
                  checked={top === t}
                  onChange={() => {
                    selectTop(t);
                  }}
                  className="accent-main"
                />
                {TOPS[t].label}
              </label>
            ))}
          </div>
          {top === "shirt" && (
            <div className="flex gap-4">
              <span className="text-description">前</span>
              {SHIRT_FRONT_IDS.map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shirtFront"
                    value={f}
                    checked={shirtFront === f}
                    onChange={() => {
                      setShirtFront(f);
                    }}
                    className="accent-main"
                  />
                  {SHIRT_FRONTS[f].label}
                </label>
              ))}
            </div>
          )}
          {top === "shirt" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={wearInner}
                onChange={(e) => {
                  setWearInner(e.target.checked);
                }}
                className="accent-main"
              />
              中にTシャツを着る（実寸はサンプルのTシャツ）
            </label>
          )}
          {layeredStatus === "tight" && (
            <p>
              <span className="rounded border border-main px-2 py-0.5 text-[11px] font-semibold">
                Tシャツの上からだとタイト
              </span>
            </p>
          )}
          {layeredStatus === "tooSmall" && (
            <p className="text-red-600">
              Tシャツを着た体の身幅より
              {Math.round(TOPS[top].stretchRatio * 100)}
              %以上小さいので、シャツだけを着せています
            </p>
          )}
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
              身幅が体より{Math.round(TOPS[top].stretchRatio * 100)}
              %以上小さいので、着せずに表示しています
            </p>
          )}
          <p className="text-xs text-muted tabular-nums">
            体の身幅 {fit.bodyWidth.toFixed(1)}cm
            {layeredStatus &&
              `（Tシャツの上から ${(fit.bodyWidth + LAYER_WIDTH_CM).toFixed(1)}cm）`}
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
                setInput(toInputs(topMeasurements(TOPS[top].sample)));
              }}
              className="rounded border border-main px-3 py-1.5 text-xs font-semibold"
            >
              服データ「{TOPS[top].sample.name}」
            </button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold">
            ズボンの実寸（cm）
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wearTrousers}
              onChange={(e) => {
                setWearTrousers(e.target.checked);
              }}
              className="accent-main"
            />
            ズボンを着る
          </label>
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
              {TROUSER_KEYS.map((k) => (
                <tr key={k}>
                  <td className="px-1 py-0.5">{TROUSER_LABELS[k]}</td>
                  <td className="px-1 py-0.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      value={trouserInput[k]}
                      aria-label={TROUSER_LABELS[k]}
                      onChange={(e) => {
                        const value = e.target.value;
                        setTrouserInput((s) => ({ ...s, [k]: value }));
                      }}
                      className="w-20 rounded border border-line px-2 py-1 text-right text-base"
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    {trouserFit.base[k].toFixed(1)}
                  </td>
                  <td className="px-1 py-0.5">
                    {trouserSize ? trouserSize[`size_${k}`].toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trouserTarget && (
            <p className="text-red-600">数値を入力してください</p>
          )}
          {trouserStatus === "tight" && (
            <p>
              <span className="rounded border border-main px-2 py-0.5 text-[11px] font-semibold">
                タイト
              </span>
            </p>
          )}
          {trouserStatus === "tooSmall" && (
            <p className="text-red-600">
              ウエスト・ヒップ・わたり幅のどれかが体より
              {Math.round(TROUSER_STRETCH_RATIO * 100)}
              %以上小さいので、着せずに表示しています
            </p>
          )}
          <p className="text-xs text-muted tabular-nums">
            体のウエスト{trouserFit.body.waist.toFixed(1)}cm・ヒップ
            {trouserFit.body.hip.toFixed(1)}cm・太もも
            {trouserFit.body.thigh.toFixed(1)}cm
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTrouserInput(toTrouserInputs(trouserFit.base, 1));
              }}
              className="rounded border border-main px-3 py-1.5 text-xs font-semibold"
            >
              この体型の基準寸法にする
            </button>
            <button
              type="button"
              onClick={() => {
                setTrouserInput(
                  toTrouserInputs(trouserMeasurements(SAMPLE_TROUSERS)),
                );
              }}
              className="rounded border border-main px-3 py-1.5 text-xs font-semibold"
            >
              服データ「{SAMPLE_TROUSERS.name}」
            </button>
          </div>
        </fieldset>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">計算時間</h2>
          {pushStats && status !== "tooSmall" && (
            <p className="text-xs text-muted tabular-nums">
              服を体の外へ押し出した頂点{pushStats.pushed}・最大
              {pushStats.maxCm.toFixed(2)}cm・{pushStats.ms.toFixed(1)}ms
            </p>
          )}
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
