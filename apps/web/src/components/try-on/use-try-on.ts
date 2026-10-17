import { useMemo, useState } from "react";
import trousersHeightJson from "@/../public/models/trousers_male_height.json";
import longsleeveHeightJson from "@/../public/models/longsleeve_male_height.json";
import shirtHeightJson from "@/../public/models/shirt_male_height.json";
import tshirtHeightJson from "@/../public/models/tshirt_male_height.json";
import presetsJson from "@/../public/presets/presets.json";
import {
  defaultAvatarSettings,
  heightFromInput,
  type AvatarSettings,
  type Build,
} from "@/lib/avatar-settings";
import {
  buildKeyValues,
  fitAt,
  fitStatus,
  heightKeyValues,
  HeightTableSchema,
  MEASUREMENT_KEYS,
  sizeKeyValues,
  STRETCH_RATIO,
  topMeasurements,
  WOVEN_STRETCH_RATIO,
  type Measurements,
} from "@/lib/garment";
import type { GarmentView } from "@pitari/api";
import { PresetsSchema } from "@/lib/presets";
import { drapeKeyValues } from "@/lib/sleeve-drape";
import {
  TROUSER_KEYS,
  trouserFitAt,
  trouserFitStatus,
  trouserKeyValues,
  trouserMeasurements,
  TrouserTableSchema,
  type TrouserMeasurements,
} from "@/lib/trousers";
import type { WornTop, WornTrousers } from "@/lib/worn-garment";

// Blenderが書き出した表。小さいので、取りに行かずにバンドルに入れる
export const heightTable = HeightTableSchema.parse(tshirtHeightJson);
export const trouserTable = TrouserTableSchema.parse(trousersHeightJson);
export const presets = PresetsSchema.parse(presetsJson);

/** 確認用の服データ。服が指定されていないときに着せる */
type SampleGarment = Pick<
  GarmentView,
  "id" | "name" | "category" | "measurements"
>;

export const SAMPLE_GARMENT = {
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
} satisfies SampleGarment;

const SAMPLE_LONGSLEEVE = {
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
} satisfies SampleGarment;

const SAMPLE_SHIRT = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "白いシャツ",
  category: "shirt",
  measurements: {
    shoulderWidthCm: 44,
    sleeveLengthCm: 60,
    bodyWidthCm: 53,
    bodyLengthCm: 62,
    waistCm: null,
    hipCm: null,
    thighWidthCm: null,
    riseCm: null,
    inseamCm: null,
    hemWidthCm: null,
  },
} satisfies SampleGarment;

/** シャツの中に着るTシャツの実寸。今はサンプルの服で固定する */
const INNER_TARGET = topMeasurements(SAMPLE_GARMENT);

/** 上の服。寸法の4項目とキーはどれも同じで、Blenderが書き出したglbと表だけが違う */
export const TOPS = {
  tshirt: {
    label: "Tシャツ",
    url: "/models/tshirt_male.glb",
    table: heightTable,
    sample: SAMPLE_GARMENT,
    stretchRatio: STRETCH_RATIO,
  },
  longsleeve: {
    label: "長袖",
    url: "/models/longsleeve_male.glb",
    table: HeightTableSchema.parse(longsleeveHeightJson),
    sample: SAMPLE_LONGSLEEVE,
    stretchRatio: STRETCH_RATIO,
  },
  shirt: {
    label: "シャツ",
    url: "/models/shirt_male.glb",
    table: HeightTableSchema.parse(shirtHeightJson),
    sample: SAMPLE_SHIRT,
    stretchRatio: WOVEN_STRETCH_RATIO,
  },
};
export type Top = keyof typeof TOPS;

/** シャツの前の開け方。元の形（キーが両方0）が「少し開ける」 */
export const SHIRT_FRONTS = {
  closed: { label: "閉める", morphs: { shirt_close: 1, shirt_open: 0 } },
  partly: { label: "少し開ける", morphs: { shirt_close: 0, shirt_open: 0 } },
  open: { label: "開ける", morphs: { shirt_close: 0, shirt_open: 1 } },
};
export type ShirtFront = keyof typeof SHIRT_FRONTS;
export const SHIRT_FRONT_IDS = Object.keys(SHIRT_FRONTS) as ShirtFront[];
export const TOP_IDS = Object.keys(TOPS) as Top[];

export const SAMPLE_TROUSERS = {
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
} satisfies SampleGarment;

export type Inputs = Record<keyof Measurements, string>;
export type TrouserInputs = Record<keyof TrouserMeasurements, string>;

export function toInputs(m: Measurements, digits = 0): Inputs {
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((k) => [k, m[k].toFixed(digits)]),
  ) as Inputs;
}

export function toTrouserInputs(
  m: TrouserMeasurements,
  digits = 0,
): TrouserInputs {
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

/** 登録した服のうち、着せる服。nullの側は見本の服で始める */
export type Worn = { top: WornTop | null; bottom: WornTrousers | null };

/**
 * 試着の状態（体・服・髪・靴の選択と服の実寸）と、そこから決まるmorphの値。
 * 本番のアバター画面と確認ページ（/dev/tryon）で使う。体と髪はinitialの値、服はwornの服で始める
 */
export function useTryOn(
  initial: AvatarSettings = defaultAvatarSettings,
  worn: Worn = { top: null, bottom: null },
) {
  const [build, setBuild] = useState<Build>(initial.build);
  const [heightInput, setHeightInput] = useState(() =>
    initial.heightCm.toFixed(1),
  );
  const [top, setTop] = useState<Top>(worn.top?.model ?? "tshirt");
  const [shirtFront, setShirtFront] = useState<ShirtFront>("partly");
  // シャツの中にTシャツを着るか（シャツのときだけ）
  const [wearInner, setWearInner] = useState(false);
  // 登録した服の寸法は写真から測った小数なので、小数1桁まで出す
  const [input, setInput] = useState<Inputs>(() =>
    worn.top
      ? toInputs(worn.top.measurements, 1)
      : toInputs(topMeasurements(SAMPLE_GARMENT)),
  );
  const topTable = TOPS[top].table;
  const [wearTrousers, setWearTrousers] = useState(true);
  const [trouserInput, setTrouserInput] = useState<TrouserInputs>(() =>
    worn.bottom
      ? toTrouserInputs(worn.bottom.measurements, 1)
      : toTrouserInputs(trouserMeasurements(SAMPLE_TROUSERS)),
  );
  const [hairId, setHairId] = useState(initial.hairId);
  const [hairColor, setHairColor] = useState(initial.hairColor);
  const [skinColor, setSkinColor] = useState(initial.skinColor);
  const [shoeId, setShoeId] = useState<string | null>(presets.shoes[0].id);
  const [sockColor, setSockColor] = useState(presets.sockColors[0]);

  const target = useMemo(() => parseInputs(MEASUREMENT_KEYS, input), [input]);
  const trouserTarget = useMemo(
    () => parseInputs(TROUSER_KEYS, trouserInput),
    [trouserInput],
  );

  // 範囲外や数値でない身長は、標準の身長で表示する
  const heightValue = heightFromInput(heightInput);
  const isHeightValid = heightValue !== null;
  const heightCm = heightValue ?? heightTable.standard_cm;

  const fit = useMemo(
    () => fitAt(build, heightCm, topTable),
    [build, heightCm, topTable],
  );
  const size = useMemo(
    () => (target ? sizeKeyValues(target, fit, topTable) : null),
    [fit, target, topTable],
  );
  const stretchRatio = TOPS[top].stretchRatio;
  const status = target ? fitStatus(target, fit, { stretchRatio }) : null;
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
    top !== "tshirt" && target ? target.sleeve - fit.base.sleeve : 0;
  const shirtMorphs = useMemo(
    () => ({
      ...bodyMorphs,
      ...(size ?? {}),
      // 身幅を大きくした分は、均等にふくらませず、脇・背中の縦のしわにする（値1で+10cm分）
      width_folds: size ? Math.max(size.size_width, 0) / 10 : 0,
      ...(top !== "tshirt" ? drapeKeyValues(sleeveExcessCm) : {}),
      ...(top === "shirt" ? SHIRT_FRONTS[shirtFront].morphs : {}),
    }),
    [bodyMorphs, size, top, sleeveExcessCm, shirtFront],
  );
  const innerFit = useMemo(
    () => fitAt(build, heightCm, heightTable),
    [build, heightCm],
  );
  const innerStatus = fitStatus(INNER_TARGET, innerFit);
  const innerMorphs = useMemo(() => {
    const innerSize = sizeKeyValues(INNER_TARGET, innerFit, heightTable);
    return {
      ...bodyMorphs,
      ...innerSize,
      width_folds: Math.max(innerSize.size_width, 0) / 10,
    };
  }, [bodyMorphs, innerFit]);
  // 中のTシャツを着られるときは、上の服をTシャツの上から着られるかも確かめる
  const tryInner =
    top === "shirt" &&
    wearInner &&
    status !== "tooSmall" &&
    innerStatus !== "tooSmall";
  const layeredStatus =
    tryInner && target
      ? fitStatus(target, fit, { stretchRatio, layered: true })
      : null;
  // Tシャツの上からだと小さすぎるときは、上の服だけを着せる
  const showInner = tryInner && layeredStatus !== "tooSmall";
  const trouserMorphs = useMemo(
    () => ({ ...bodyMorphs, ...(trouserSize ?? {}) }),
    [bodyMorphs, trouserSize],
  );
  const tooSmall = [
    status === "tooSmall" ? TOPS[top].label : null,
    top === "shirt" && wearInner && innerStatus === "tooSmall"
      ? "中のTシャツ"
      : null,
    layeredStatus === "tooSmall" ? `Tシャツの上の${TOPS[top].label}` : null,
    wearTrousers && trouserStatus === "tooSmall" ? "ズボン" : null,
  ].filter((name) => name !== null);
  const tight = [
    showInner
      ? layeredStatus === "tight"
        ? `Tシャツの上の${TOPS[top].label}`
        : null
      : status === "tight"
        ? TOPS[top].label
        : null,
    showInner && innerStatus === "tight" ? "中のTシャツ" : null,
    wearTrousers && trouserStatus === "tight" ? "ズボン" : null,
  ].filter((name) => name !== null);

  /** TryOnSceneにそのまま渡す値（計算時間の計測などは各画面で足す） */
  const sceneProps = {
    heightScale: heightCm / heightTable.standard_cm,
    bodyMorphs,
    shirtUrl: TOPS[top].url,
    shirtMorphs,
    showShirt: status !== "tooSmall",
    innerUrl: TOPS.tshirt.url,
    innerMorphs,
    showInner,
    trouserMorphs,
    showTrousers: wearTrousers && trouserStatus !== "tooSmall",
    skinColor,
    hairUrl: presets.hair.find((h) => h.id === hairId)?.path ?? null,
    faceUrl: presets.face.path,
    hairColor,
    shoe: presets.shoes.find((s) => s.id === shoeId) ?? null,
    sockColor,
  };

  return {
    build,
    setBuild,
    heightInput,
    setHeightInput,
    heightCm,
    isHeightValid,
    top,
    setTop,
    shirtFront,
    setShirtFront,
    wearInner,
    setWearInner,
    innerStatus: showInner ? innerStatus : null,
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
    tight,
    sceneProps,
    /** 上の服を選び直す（実寸はその服のサンプルにする） */
    selectTop: (t: Top) => {
      setTop(t);
      setInput(toInputs(topMeasurements(TOPS[t].sample)));
    },
  };
}
