"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import trousersHeightJson from "@/../public/models/trousers_male_height.json";
import longsleeveHeightJson from "@/../public/models/longsleeve_male_height.json";
import tshirtHeightJson from "@/../public/models/tshirt_male_height.json";
import presetsJson from "@/../public/presets/presets.json";
import type { Benchmark } from "@/app/dev/tryon/tryon-scene";
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
  topMeasurements,
  type Build,
  type Measurements,
} from "@/lib/garment";
import { PresetsSchema } from "@/lib/presets";
import { drapeKeyValues } from "@/lib/sleeve-drape";
import type { PushStats } from "@/lib/push-out";
import {
  TROUSER_KEYS,
  TROUSER_LABELS,
  TROUSER_STRETCH_RATIO,
  trouserFitAt,
  trouserFitStatus,
  trouserKeyValues,
  trouserMeasurements,
  TrouserTableSchema,
  type TrouserMeasurements,
} from "@/lib/trousers";

// three.jsはブラウザでだけ動かす
const TryOnScene = dynamic(() => import("@/app/dev/tryon/tryon-scene"), {
  ssr: false,
});

// Blenderが書き出した表。小さいので、取りに行かずにバンドルに入れる
const heightTable = HeightTableSchema.parse(tshirtHeightJson);
const trouserTable = TrouserTableSchema.parse(trousersHeightJson);
const presets = PresetsSchema.parse(presetsJson);

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

const SAMPLE_LONGSLEEVE = GarmentSchema.parse({
  id: "33333333-3333-4333-8333-333333333333",
  name: "白い長袖",
  category: "long_sleeve_top",
  measurements: {
    shoulderWidthCm: 45,
    sleeveLengthCm: 60,
    bodyWidthCm: 52,
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

/** 上の服。寸法の4項目とキーはどちらも同じで、Blenderが書き出したglbと表だけが違う */
const TOPS = {
  tshirt: {
    label: "Tシャツ",
    url: "/models/tshirt_male.glb",
    table: heightTable,
    sample: SAMPLE_GARMENT,
  },
  longsleeve: {
    label: "長袖",
    url: "/models/longsleeve_male.glb",
    table: HeightTableSchema.parse(longsleeveHeightJson),
    sample: SAMPLE_LONGSLEEVE,
  },
};
type Top = keyof typeof TOPS;
const TOP_IDS = Object.keys(TOPS) as Top[];

const SAMPLE_TROUSERS = GarmentSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  name: "ジーンズ",
  category: "trousers",
  measurements: {
    shoulderWidthCm: null,
    sleeveLengthCm: null,
    bodyWidthCm: null,
    bodyLengthCm: null,
    waistCm: 84,
    hipCm: 104,
    thighWidthCm: 30,
    riseCm: 22,
    inseamCm: 76,
    hemWidthCm: 19,
  },
  measurementVersion: "df2-a4-flat-midpoint-v2",
});

type Inputs = Record<keyof Measurements, string>;
type TrouserInputs = Record<keyof TrouserMeasurements, string>;

function toInputs(m: Measurements, digits = 0): Inputs {
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((k) => [k, m[k].toFixed(digits)]),
  ) as Inputs;
}

function toTrouserInputs(m: TrouserMeasurements, digits = 0): TrouserInputs {
  return Object.fromEntries(
    TROUSER_KEYS.map((k) => [k, m[k].toFixed(digits)]),
  ) as TrouserInputs;
}

/** 入力の文字を寸法にする。空欄や数値でないものがあればnull */
function parseInputs<K extends string>(
  keys: readonly K[],
  input: Record<K, string>,
): Record<K, number> | null {
  const ok = keys.every(
    (k) => input[k].trim() !== "" && Number.isFinite(Number(input[k])),
  );
  return ok
    ? (Object.fromEntries(keys.map((k) => [k, Number(input[k])])) as Record<
        K,
        number
      >)
    : null;
}

function ColorChoices({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0">{label}</span>
      <div className="flex gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={value === c}
            onClick={() => {
              onChange(c);
            }}
            style={{ backgroundColor: c }}
            className="size-7 rounded-full border border-line aria-pressed:ring-2 aria-pressed:ring-main aria-pressed:ring-offset-2"
          />
        ))}
      </div>
    </div>
  );
}

export default function TryOnClient() {
  const [build, setBuild] = useState<Build>("standard");
  const [heightInput, setHeightInput] = useState(() =>
    heightTable.standard_cm.toFixed(1),
  );
  const [top, setTop] = useState<Top>("tshirt");
  const [input, setInput] = useState<Inputs>(() =>
    toInputs(topMeasurements(SAMPLE_GARMENT)),
  );
  const topTable = TOPS[top].table;
  const [wearTrousers, setWearTrousers] = useState(true);
  const [trouserInput, setTrouserInput] = useState<TrouserInputs>(() =>
    toTrouserInputs(trouserMeasurements(SAMPLE_TROUSERS)),
  );
  const [hairId, setHairId] = useState<string | null>(presets.hair[0].id);
  const [hairColor, setHairColor] = useState(presets.hairColors[1]);
  const [skinColor, setSkinColor] = useState(presets.skinColors[1]);
  const [wearShoes, setWearShoes] = useState(true);
  const [pushStats, setPushStats] = useState<PushStats | null>(null);
  const [benchmarkRequest, setBenchmarkRequest] = useState(0);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

  const target = useMemo(() => parseInputs(MEASUREMENT_KEYS, input), [input]);
  const trouserTarget = useMemo(
    () => parseInputs(TROUSER_KEYS, trouserInput),
    [trouserInput],
  );

  // 範囲外や数値でない身長は、標準の身長で表示する
  const heightValue = Number(heightInput);
  const isHeightValid =
    heightInput.trim() !== "" &&
    heightValue >= HEIGHT_MIN_CM &&
    heightValue <= HEIGHT_MAX_CM;
  const heightCm = isHeightValid ? heightValue : heightTable.standard_cm;

  const fit = useMemo(
    () => fitAt(build, heightCm, topTable),
    [build, heightCm, topTable],
  );
  const size = useMemo(
    () => (target ? sizeKeyValues(target, fit, topTable) : null),
    [fit, target, topTable],
  );
  const status = target ? fitStatus(target, fit) : null;
  const trouserFit = useMemo(
    () => trouserFitAt(build, heightCm, trouserTable),
    [build, heightCm],
  );
  const trouserSize = useMemo(
    () =>
      trouserTarget
        ? trouserKeyValues(trouserTarget, trouserFit, trouserTable)
        : null,
    [trouserFit, trouserTarget],
  );
  const trouserStatus = trouserTarget
    ? trouserFitStatus(trouserTarget, trouserFit)
    : null;

  const bodyMorphs = useMemo(
    () => ({
      ...buildKeyValues(build),
      ...heightKeyValues(heightCm, heightTable),
    }),
    [build, heightCm],
  );
  // 長袖の袖丈が腕より長いときは、余った袖が手に垂れた形（垂れ方のキー）を混ぜる
  const sleeveExcessCm =
    top === "longsleeve" && target ? target.sleeve - fit.base.sleeve : 0;
  const shirtMorphs = useMemo(
    () => ({
      ...bodyMorphs,
      ...(size ?? {}),
      ...(top === "longsleeve" ? drapeKeyValues(sleeveExcessCm) : {}),
    }),
    [bodyMorphs, size, top, sleeveExcessCm],
  );
  const trouserMorphs = useMemo(
    () => ({ ...bodyMorphs, ...(trouserSize ?? {}) }),
    [bodyMorphs, trouserSize],
  );
  const tooSmall = [
    status === "tooSmall" ? TOPS[top].label : null,
    wearTrousers && trouserStatus === "tooSmall" ? "ズボン" : null,
  ].filter((name) => name !== null);

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
            heightScale={heightCm / heightTable.standard_cm}
            bodyMorphs={bodyMorphs}
            shirtUrl={TOPS[top].url}
            shirtMorphs={shirtMorphs}
            showShirt={status !== "tooSmall"}
            trouserMorphs={trouserMorphs}
            showTrousers={wearTrousers && trouserStatus !== "tooSmall"}
            skinColor={skinColor}
            hairUrl={presets.hair.find((h) => h.id === hairId)?.path ?? null}
            faceUrl={presets.face.path}
            hairColor={hairColor}
            shoesUrl={wearShoes ? presets.shoes[0].path : null}
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wearShoes}
              onChange={(e) => {
                setWearShoes(e.target.checked);
              }}
              className="accent-main"
            />
            {presets.shoes[0].name}を履く
          </label>
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
                    setTop(t);
                    setInput(toInputs(topMeasurements(TOPS[t].sample)));
                  }}
                  className="accent-main"
                />
                {TOPS[t].label}
              </label>
            ))}
          </div>
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
