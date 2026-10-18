"use client";

import dynamic from "next/dynamic";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
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
  type Worn,
} from "@/components/try-on/use-try-on";
import { useGarmentTexture } from "@/components/try-on/use-garment-texture";
import { useOutfit } from "@/components/try-on/use-outfit";
import { avatarUrl, type OutfitSlot } from "@/lib/outfit";
import {
  BODY_FRAME_LABELS,
  BODY_FRAMES,
  BUILD_LABELS,
  BUILDS,
  avatarSettingsStore,
  defaultAvatarSettings,
  GENDER_LABELS,
  GENDERS,
  heightFromInput,
  heightRangeOf,
  modelGenderOf,
  withGender,
  type AvatarSettings,
} from "@/lib/avatar-settings";
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS } from "@/lib/garment";
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

/** 寸法の入力欄（cm）。problemがあれば直す内容を、outsideなら形がずれうることを出す */
function SizeInput({
  label,
  value,
  onChange,
  problem,
  outside,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  problem: string | undefined;
  outside: boolean;
}) {
  // スクリーンリーダーでも、欄から直す内容や案内を読めるようにする
  const noteId = useId();
  return (
    <>
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
            aria-invalid={problem !== undefined}
            aria-describedby={problem || outside ? noteId : undefined}
            className="w-18 rounded border border-line px-2 py-1 text-right text-base tabular-nums aria-invalid:border-red-600"
          />
          <span className="text-xs text-muted">cm</span>
        </span>
      </label>
      {problem ? (
        <p id={noteId} className="text-right text-xs text-red-600">
          {problem}
        </p>
      ) : (
        outside && (
          <p id={noteId} className="text-right text-xs text-description">
            確かめた範囲の外なので、形がずれることがあります
          </p>
        )
      )}
    </>
  );
}

/** 身長の入力欄。3Dで変えられる範囲（性別ごと）の外なら、範囲を出す */
function HeightInput({
  value,
  range,
  onChange,
}: {
  value: string;
  range: readonly [number, number];
  onChange: (value: string) => void;
}) {
  const isValid = heightFromInput(value, range) !== null;
  const [min, max] = range;
  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span>身長</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={0.5}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            aria-invalid={!isValid}
            className="w-20 rounded border border-line px-2 py-1 text-right text-base tabular-nums aria-invalid:border-red-600"
          />
          <span className="text-xs text-muted">cm</span>
        </span>
      </label>
      {!isValid && (
        <p className="text-right text-xs text-red-600">
          {min}〜{max}cmで入力してください
        </p>
      )}
    </>
  );
}

/** 性別と、女性のときだけ骨格。女性は女性のアバター、男性と「選ばない」は男性のアバターを出す */
function GenderFields({
  settings,
  onChange,
}: {
  settings: AvatarSettings;
  onChange: (settings: AvatarSettings) => void;
}) {
  return (
    <>
      <Row label="性別">
        <Segmented
          label="性別"
          options={GENDERS.map((g) => ({ id: g, label: GENDER_LABELS[g] }))}
          value={settings.gender}
          onChange={(gender) => {
            onChange(withGender(settings, gender));
          }}
        />
        {settings.gender === "unspecified" && (
          <p className="text-xs leading-relaxed text-description">
            男性のアバターで表示します。
          </p>
        )}
        {settings.gender === "female" && (
          <p className="text-xs leading-relaxed text-description">
            骨格は、今はアバターの形に反映しません。
          </p>
        )}
      </Row>
      {settings.bodyFrame !== null && (
        <Row label="骨格">
          <Segmented
            label="骨格"
            options={BODY_FRAMES.map((f) => ({
              id: f,
              label: BODY_FRAME_LABELS[f],
            }))}
            value={settings.bodyFrame}
            onChange={(bodyFrame) => {
              onChange({ ...settings, bodyFrame });
            }}
          />
        </Row>
      )}
    </>
  );
}

/** アバター画面：初めて開いたときは体の登録、登録したあとは試着の画面を出す */
export function AvatarClient() {
  // サーバーで描くときはlocalStorageが無いので、読み込み中として描く
  const settings = useSyncExternalStore(
    avatarSettingsStore.subscribe,
    avatarSettingsStore.get,
    () => undefined,
  );
  if (settings === undefined)
    return (
      <main className="px-4 py-5">
        <AvatarFrame loading />
      </main>
    );
  if (settings === null)
    return <AvatarSetup onDone={avatarSettingsStore.save} />;
  return (
    <AvatarWithOutfit settings={settings} onChange={avatarSettingsStore.save} />
  );
}

/** URLで指定された服を読んでから、試着の画面を出す。着せられない服は理由を出し、その側は見本の服にする */
function AvatarWithOutfit({
  settings,
  onChange,
}: {
  settings: AvatarSettings;
  onChange: (settings: AvatarSettings) => void;
}) {
  const { outfit, top, bottom, takeOff } = useOutfit();
  // 着せられる服だけ、写真のテクスチャを聞く
  const textureUrls = {
    top: useGarmentTexture(
      top !== "loading" && top !== null && "worn" in top ? outfit.top : null,
    ),
    bottom: useGarmentTexture(
      bottom !== "loading" && bottom !== null && "worn" in bottom
        ? outfit.bottom
        : null,
    ),
  };
  if (top === "loading" || bottom === "loading")
    return (
      <main className="px-4 py-5">
        <AvatarFrame loading />
      </main>
    );
  const problems = {
    top: top && "problem" in top ? top.problem : null,
    bottom: bottom && "problem" in bottom ? bottom.problem : null,
  };
  return (
    // 服が変わったら、試着の状態をその服の寸法で作り直す。
    // アバターの性別が変わったときも、その性別の3Dモデル・身長・見本の服で作り直す
    <AvatarEditor
      key={`${avatarUrl(outfit)} ${modelGenderOf(settings.gender)}`}
      settings={settings}
      onChange={onChange}
      worn={{
        top: top && "worn" in top ? top.worn : null,
        bottom: bottom && "worn" in bottom ? bottom.worn : null,
      }}
      problems={problems}
      textureUrls={textureUrls}
      onTakeOff={takeOff}
    />
  );
}

/** URLで指定された服の名前（着せられないときは理由）と、外すボタン。着せられない服も外せないと、開くたびに同じ理由が出る */
function OutfitGarment({
  text,
  isProblem = false,
  onTakeOff,
}: {
  text: string;
  isProblem?: boolean;
  onTakeOff: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2">
      {isProblem ? (
        <span
          role="status"
          className="text-xs leading-relaxed wrap-anywhere text-red-600"
        >
          {text}
        </span>
      ) : (
        <span className="font-semibold wrap-anywhere">{text}</span>
      )}
      <button
        type="button"
        onClick={onTakeOff}
        className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[13px] transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
      >
        外す
      </button>
    </div>
  );
}

/** 初めて開いたときの登録。性別・身長・体型と、女性のときだけ骨格を聞く */
function AvatarSetup({
  onDone,
}: {
  onDone: (settings: AvatarSettings) => void;
}) {
  const [settings, setSettings] = useState(defaultAvatarSettings);
  const [heightInput, setHeightInput] = useState(() =>
    defaultAvatarSettings.heightCm.toFixed(1),
  );
  const heightRange = heightRangeOf(settings.gender);
  const heightCm = heightFromInput(heightInput, heightRange);

  return (
    <main className="flex flex-col gap-5 px-4 py-5 text-[13px] motion-safe:animate-fade-in">
      <p className="text-sm leading-relaxed">
        服を着せるアバターを、あなたの体に合わせます。あとからアバターの画面で変えられます。
      </p>
      {/* 身長はアバターの画面と同じく0.5cm刻みでなくてもよいので、ブラウザの検証は使わない */}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (heightCm !== null) onDone({ ...settings, heightCm });
        }}
      >
        <GenderFields settings={settings} onChange={setSettings} />
        <HeightInput
          value={heightInput}
          range={heightRange}
          onChange={setHeightInput}
        />
        <Row label="体型">
          <Segmented
            label="体型"
            options={BUILDS.map((b) => ({ id: b, label: BUILD_LABELS[b] }))}
            value={settings.build}
            onChange={(build) => {
              setSettings({ ...settings, build });
            }}
          />
        </Row>
        <button
          type="submit"
          disabled={heightCm === null}
          className="mt-2 min-h-12 w-full rounded bg-main text-sm font-semibold text-white transition hover:opacity-85 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
        >
          はじめる
        </button>
      </form>
    </main>
  );
}

/** 試着の画面：身長・体型と、服・髪・靴を選んで着せる。体と髪を変えたら設定に保存する。登録した服が無い側は見本の服を着せる */
function AvatarEditor({
  settings,
  onChange,
  worn,
  problems,
  textureUrls,
  onTakeOff,
}: {
  settings: AvatarSettings;
  onChange: (settings: AvatarSettings) => void;
  worn: Worn;
  problems: Record<OutfitSlot, string | null>;
  textureUrls: Record<OutfitSlot, string | null>;
  onTakeOff: (slot: OutfitSlot) => void;
}) {
  const {
    build,
    setBuild,
    heightInput,
    setHeightInput,
    top,
    shirtFront,
    setShirtFront,
    wearInner,
    setWearInner,
    input,
    setInput,
    topCheck,
    wearTrousers,
    setWearTrousers,
    trouserInput,
    setTrouserInput,
    trouserCheck,
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
    tight,
    sceneProps,
    selectTop,
    presetUrl,
  } = useTryOn(settings, worn);

  function update(change: Partial<AvatarSettings>) {
    onChange({ ...settings, ...change });
  }

  return (
    <main className="flex flex-col gap-5 px-4 py-5 text-[13px] motion-safe:animate-fade-in">
      <div className="relative">
        <AvatarErrorBoundary>
          <div className="aspect-3/4 w-full touch-none overflow-hidden rounded bg-surface">
            <TryOnScene
              {...sceneProps}
              shirtTextureUrl={textureUrls.top}
              trouserTextureUrl={textureUrls.bottom}
            />
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
        <GenderFields settings={settings} onChange={onChange} />
        <HeightInput
          value={heightInput}
          range={heightRangeOf(settings.gender)}
          onChange={(value) => {
            setHeightInput(value);
            const heightCm = heightFromInput(
              value,
              heightRangeOf(settings.gender),
            );
            if (heightCm !== null) update({ heightCm });
          }}
        />
        <Row label="体型">
          <Segmented
            label="体型"
            options={BUILDS.map((b) => ({ id: b, label: BUILD_LABELS[b] }))}
            value={build}
            onChange={(b) => {
              setBuild(b);
              update({ build: b });
            }}
          />
        </Row>
        <ColorChoices
          label="肌の色"
          colors={presets.skinColors}
          value={skinColor}
          onChange={(color) => {
            setSkinColor(color);
            update({ skinColor: color });
          }}
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
                update({ hairId: h?.id ?? null });
              }}
              className="flex flex-col items-center gap-0.5 rounded border border-line p-1 text-[11px] aria-pressed:border-main aria-pressed:font-semibold"
            >
              {h ? (
                // eslint-disable-next-line @next/next/no-img-element -- 512pxの小さいサムネイルなので最適化しない
                <img
                  src={presetUrl(h.thumbs.front)}
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
          onChange={(color) => {
            setHairColor(color);
            update({ hairColor: color });
          }}
        />
      </Section>

      <Section title="服">
        <Row label="トップス">
          {worn.top ? (
            <OutfitGarment
              text={worn.top.name}
              onTakeOff={() => {
                onTakeOff("top");
              }}
            />
          ) : (
            <>
              {problems.top && (
                <OutfitGarment
                  text={problems.top}
                  isProblem
                  onTakeOff={() => {
                    onTakeOff("top");
                  }}
                />
              )}
              <Segmented
                label="トップス"
                options={TOP_IDS.map((t) => ({ id: t, label: TOPS[t].label }))}
                value={top}
                onChange={selectTop}
              />
            </>
          )}
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
          {worn.bottom ? (
            <OutfitGarment
              text={worn.bottom.name}
              onTakeOff={() => {
                onTakeOff("bottom");
              }}
            />
          ) : (
            <>
              {problems.bottom && (
                <OutfitGarment
                  text={problems.bottom}
                  isProblem
                  onTakeOff={() => {
                    onTakeOff("bottom");
                  }}
                />
              )}
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
            </>
          )}
        </Row>
        <details className="rounded border border-line px-3 py-2">
          <summary className="cursor-pointer font-semibold">
            服の実寸を変える
          </summary>
          <p className="mt-2 text-xs text-description">
            登録した服は、その服の実寸が入ります。ここで変えても、服には保存しません。登録した服が無いときは見本の服の値です。
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
                problem={topCheck.problems[k]}
                outside={topCheck.outside.includes(k)}
              />
            ))}
            {wearTrousers && (
              <>
                <span className="mt-2 text-xs text-description">
                  {worn.bottom?.name ?? "ジーンズ"}
                </span>
                {TROUSER_KEYS.map((k) => (
                  <SizeInput
                    key={k}
                    label={TROUSER_LABELS[k]}
                    value={trouserInput[k]}
                    onChange={(value) => {
                      setTrouserInput((s) => ({ ...s, [k]: value }));
                    }}
                    problem={trouserCheck.problems[k]}
                    outside={trouserCheck.outside.includes(k)}
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
