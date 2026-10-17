"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { AvatarErrorBoundary } from "@/components/avatar-error-boundary";
import { AvatarFrame } from "@/components/avatar-frame";
import { ColorChoices } from "@/components/try-on/color-choices";
import {
  presets,
  SHIRT_FRONT_IDS,
  SHIRT_FRONTS,
  TOP_IDS,
  TOPS,
  useTryOn,
} from "@/components/try-on/use-try-on";
import {
  BUILD_LABELS,
  BUILDS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  MEASUREMENT_KEYS,
  MEASUREMENT_LABELS,
} from "@/lib/garment";
import { TROUSER_KEYS, TROUSER_LABELS } from "@/lib/trousers";

// three.jsはブラウザでだけ動かす。読み込み中も同じ大きさの枠を出す
const TryOnScene = dynamic(() => import("@/components/try-on/try-on-scene"), {
  ssr: false,
  loading: () => <AvatarFrame loading />,
});

/** 選択肢を横に並べたラジオボタン。選んでいるものを塗る */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  // 本物のラジオボタンを見えないように置き、矢印キーでの移動と選択はブラウザに任せる
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o) => (
        <label key={o.id} className="cursor-pointer">
          <input
            type="radio"
            name={label}
            value={o.id}
            checked={value === o.id}
            onChange={() => {
              onChange(o.id);
            }}
            className="peer sr-only"
          />
          <span className="block rounded-full border border-line px-3.5 py-1.5 text-[13px] transition peer-checked:border-main peer-checked:bg-main peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-main">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-description">{label}</span>
      {children}
    </div>
  );
}

/** 寸法の入力欄（cm） */
function SizeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={0.5}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="w-18 rounded border border-line px-2 py-1 text-right text-base tabular-nums"
        />
        <span className="text-xs text-muted">cm</span>
      </span>
    </label>
  );
}

/** アバター画面：身長・体型と、服・髪・靴を選んで着せる。服の実寸は、今はサンプルの服の値 */
export function AvatarClient() {
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
    innerStatus,
    input,
    setInput,
    status,
    wearTrousers,
    setWearTrousers,
    trouserInput,
    setTrouserInput,
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
  const tight = [
    status === "tight" ? TOPS[top].label : null,
    innerStatus === "tight" ? "中のTシャツ" : null,
    wearTrousers && trouserStatus === "tight" ? "ズボン" : null,
  ].filter((name) => name !== null);

  return (
    <main className="flex flex-col gap-5 px-4 py-5 text-[13px] motion-safe:animate-fade-in">
      <div className="relative">
        <AvatarErrorBoundary>
          <div className="aspect-3/4 w-full touch-none overflow-hidden rounded bg-surface">
            <TryOnScene {...sceneProps} />
          </div>
        </AvatarErrorBoundary>
        {tooSmall.length > 0 && (
          <p className="absolute inset-x-4 top-4 rounded bg-white/90 px-3 py-2 text-center font-semibold">
            {tooSmall.join("と")}が小さすぎて着られません
          </p>
        )}
        {tight.length > 0 && (
          <span className="absolute top-3 left-3 rounded border border-main bg-white/90 px-2 py-0.5 text-[11px] font-semibold">
            {tight.join("・")}がタイト
          </span>
        )}
        <p className="mt-1.5 text-center text-[11px] text-muted">
          ドラッグで回転、ピンチで拡大
        </p>
      </div>

      <Section title="体">
        <label className="flex items-center justify-between gap-3">
          <span>身長</span>
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
            <span className="text-xs text-muted">cm</span>
          </span>
        </label>
        {!isHeightValid && (
          <p className="text-right text-xs text-red-600">
            {HEIGHT_MIN_CM}〜{HEIGHT_MAX_CM}cmで入力してください
          </p>
        )}
        <Row label="体型">
          <Segmented
            label="体型"
            options={BUILDS.map((b) => ({ id: b, label: BUILD_LABELS[b] }))}
            value={build}
            onChange={setBuild}
          />
        </Row>
        <ColorChoices
          label="肌の色"
          colors={presets.skinColors}
          value={skinColor}
          onChange={setSkinColor}
        />
      </Section>

      <Section title="髪">
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
                // eslint-disable-next-line @next/next/no-img-element -- 512pxの小さいサムネイルなので最適化しない
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
      </Section>

      <Section title="服">
        <Row label="トップス">
          <Segmented
            label="トップス"
            options={TOP_IDS.map((t) => ({ id: t, label: TOPS[t].label }))}
            value={top}
            onChange={selectTop}
          />
        </Row>
        {top === "shirt" && (
          <Row label="シャツの前">
            <Segmented
              label="シャツの前"
              options={SHIRT_FRONT_IDS.map((f) => ({
                id: f,
                label: SHIRT_FRONTS[f].label,
              }))}
              value={shirtFront}
              onChange={setShirtFront}
            />
          </Row>
        )}
        {top === "shirt" && (
          <Row label="シャツの中">
            <Segmented
              label="シャツの中"
              options={[
                { id: "none", label: "なし" },
                { id: "tshirt", label: "Tシャツ" },
              ]}
              value={wearInner ? "tshirt" : "none"}
              onChange={(id) => {
                setWearInner(id === "tshirt");
              }}
            />
          </Row>
        )}
        <Row label="ボトムス">
          <Segmented
            label="ボトムス"
            options={[
              { id: "jeans", label: "ジーンズ" },
              { id: "none", label: "なし" },
            ]}
            value={wearTrousers ? "jeans" : "none"}
            onChange={(id) => {
              setWearTrousers(id === "jeans");
            }}
          />
        </Row>
        <details className="rounded border border-line px-3 py-2">
          <summary className="cursor-pointer font-semibold">
            服の実寸を変える
          </summary>
          <p className="mt-2 text-xs text-description">
            登録した服を着せるときは、ここに服の実寸が入ります（今はサンプルの服の値）。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <span className="text-xs text-description">{TOPS[top].label}</span>
            {MEASUREMENT_KEYS.map((k) => (
              <SizeInput
                key={k}
                label={MEASUREMENT_LABELS[k]}
                value={input[k]}
                onChange={(value) => {
                  setInput((s) => ({ ...s, [k]: value }));
                }}
              />
            ))}
            {wearTrousers && (
              <>
                <span className="mt-2 text-xs text-description">ジーンズ</span>
                {TROUSER_KEYS.map((k) => (
                  <SizeInput
                    key={k}
                    label={TROUSER_LABELS[k]}
                    value={trouserInput[k]}
                    onChange={(value) => {
                      setTrouserInput((s) => ({ ...s, [k]: value }));
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </details>
      </Section>

      <Section title="靴">
        <Segmented
          label="靴"
          options={[
            { id: "none", label: "裸足" },
            ...presets.shoes.map((s) => ({ id: s.id, label: s.name })),
          ]}
          value={shoeId ?? "none"}
          onChange={(id) => {
            setShoeId(id === "none" ? null : id);
          }}
        />
        {shoeId !== null && (
          <ColorChoices
            label="靴下の色"
            colors={presets.sockColors}
            value={sockColor}
            onChange={setSockColor}
          />
        )}
      </Section>
    </main>
  );
}
