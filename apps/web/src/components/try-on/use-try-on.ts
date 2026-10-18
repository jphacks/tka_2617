import { useMemo, useState } from "react";
import presetsJson from "@/../public/presets/presets.json";
import { AVATAR_MODELS } from "@/lib/avatar-models";
import {
  defaultAvatarSettings,
  heightFromInput,
  modelGenderOf,
  type AvatarSettings,
  type ModelGender,
  type Build,
} from "@/lib/avatar-settings";
import {
  buildKeyValues,
  fitAt,
  fitStatus,
  heightKeyValues,
  MEASUREMENT_KEYS,
  sizeKeyValues,
  STRETCH_RATIO,
  topMeasurements,
  WOVEN_STRETCH_RATIO,
  type Measurements,
} from "@/lib/garment";
import type { GarmentView } from "@pitari/api";
import { PresetsSchema } from "@/lib/presets";
import {
  checkSizes,
  TOP_VERIFIED,
  TROUSER_VERIFIED,
  withinLimits,
} from "@/lib/size-check";
import { drapeKeyValues } from "@/lib/sleeve-drape";
import {
  TROUSER_KEYS,
  trouserFitAt,
  trouserFitStatus,
  trouserKeyValues,
  trouserMeasurements,
  type TrouserMeasurements,
} from "@/lib/trousers";
import type { WornTop, WornTrousers } from "@/lib/worn-garment";

export const presets = PresetsSchema.parse(presetsJson);

/** 確認用の服データ。服が指定されていないときに着せる */
type SampleGarment = Pick<
  GarmentView,
  "id" | "name" | "category" | "measurements"
>;

const SAMPLE_GARMENT = {
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

/**
 * 上の服。寸法の4項目とキーはどれも同じで、Blenderが書き出したglbと表だけが違う
 * （性別ごとのglbと表は`AVATAR_MODELS`）
 */
export const TOPS = {
  tshirt: {
    label: "Tシャツ",
    stretchRatio: STRETCH_RATIO,
  },
  longsleeve: {
    label: "長袖",
    stretchRatio: STRETCH_RATIO,
  },
  shirt: {
    label: "シャツ",
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

const SAMPLE_TROUSERS = {
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

// 女性の確認用の服。女性の体の基準寸法（標準体型・標準の身長）より少し大きい、レディースのMくらい。
// 男性の服をそのまま着せると、身幅・肩幅が8cmほど大きく、太って見える
const FEMALE_TSHIRT = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "白いTシャツ（レディース）",
  category: "short_sleeve_top",
  measurements: {
    shoulderWidthCm: 40,
    sleeveLengthCm: 19,
    bodyWidthCm: 46,
    bodyLengthCm: 63,
    waistCm: null,
    hipCm: null,
    thighWidthCm: null,
    riseCm: null,
    inseamCm: null,
    hemWidthCm: null,
  },
} satisfies SampleGarment;

const FEMALE_LONGSLEEVE = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "白い長袖（レディース）",
  category: "long_sleeve_top",
  measurements: {
    shoulderWidthCm: 40,
    sleeveLengthCm: 52,
    bodyWidthCm: 47,
    bodyLengthCm: 63,
    waistCm: null,
    hipCm: null,
    thighWidthCm: null,
    riseCm: null,
    inseamCm: null,
    hemWidthCm: null,
  },
} satisfies SampleGarment;

const FEMALE_SHIRT = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "白いシャツ（レディース）",
  category: "shirt",
  measurements: {
    shoulderWidthCm: 38,
    sleeveLengthCm: 53,
    bodyWidthCm: 47,
    bodyLengthCm: 60,
    waistCm: null,
    hipCm: null,
    thighWidthCm: null,
    riseCm: null,
    inseamCm: null,
    hemWidthCm: null,
  },
} satisfies SampleGarment;

const FEMALE_TROUSERS = {
  id: "88888888-8888-4888-8888-888888888888",
  name: "ジーンズ（レディース）",
  category: "trousers",
  measurements: {
    shoulderWidthCm: null,
    sleeveLengthCm: null,
    bodyWidthCm: null,
    bodyLengthCm: null,
    waistCm: 84,
    hipCm: 102,
    thighWidthCm: 28,
    riseCm: 23,
    inseamCm: 68,
    hemWidthCm: 17,
  },
} satisfies SampleGarment;

/** 性別ごとの確認用の服（上の服とズボン）。服が指定されていないときに着せる */
const SAMPLES = {
  male: {
    tshirt: SAMPLE_GARMENT,
    longsleeve: SAMPLE_LONGSLEEVE,
    shirt: SAMPLE_SHIRT,
    trousers: SAMPLE_TROUSERS,
  },
  female: {
    tshirt: FEMALE_TSHIRT,
    longsleeve: FEMALE_LONGSLEEVE,
    shirt: FEMALE_SHIRT,
    trousers: FEMALE_TROUSERS,
  },
} satisfies Record<ModelGender, Record<Top | "trousers", SampleGarment>>;

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
 * 本番のアバター画面と確認ページ（/dev/tryon）で使う。体と髪はinitialの値、服はwornの服で始める。
 * 3Dモデルは設定の性別で始める（女性は女性、ほかは男性）。確認ページは、selectGenderで切り替えられる
 */
export function useTryOn(
  initial: AvatarSettings = defaultAvatarSettings,
  worn: Worn = { top: null, bottom: null },
) {
  const [gender, setGender] = useState<ModelGender>(() =>
    modelGenderOf(initial.gender),
  );
  const models = AVATAR_MODELS[gender];
  const samples = SAMPLES[gender];
  const heightTable = models.tops.tshirt.table;
  const trouserTable = models.trouserTable;
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
      : toInputs(topMeasurements(SAMPLES[gender].tshirt)),
  );
  const topTable = models.tops[top].table;
  const [wearTrousers, setWearTrousers] = useState(true);
  const [trouserInput, setTrouserInput] = useState<TrouserInputs>(() =>
    worn.bottom
      ? toTrouserInputs(worn.bottom.measurements, 1)
      : toTrouserInputs(trouserMeasurements(SAMPLES[gender].trousers)),
  );
  const [hairId, setHairId] = useState(initial.hairId);
  const [hairColor, setHairColor] = useState(initial.hairColor);
  const [skinColor, setSkinColor] = useState(initial.skinColor);
  const [shoeId, setShoeId] = useState<string | null>(presets.shoes[0].id);
  const [sockColor, setSockColor] = useState(presets.sockColors[0]);

  const parsedTarget = useMemo(
    () => parseInputs(MEASUREMENT_KEYS, input),
    [input],
  );
  const parsedTrouserTarget = useMemo(
    () => parseInputs(TROUSER_KEYS, trouserInput),
    [trouserInput],
  );

  // 範囲外や数値でない身長は、標準の身長で表示する
  const heightValue = heightFromInput(heightInput, models.heightRangeCm);
  const isHeightValid = heightValue !== null;
  const heightCm = heightValue ?? heightTable.standard_cm;

  const fit = useMemo(
    () => fitAt(build, heightCm, topTable),
    [build, heightCm, topTable],
  );
  // 0や負数、基準寸法から極端に離れた値はモデルへ渡さず、直すまで最後の正常な形を保つ
  const topCheck = useMemo(
    () => checkSizes(MEASUREMENT_KEYS, input, fit.base, TOP_VERIFIED),
    [input, fit.base],
  );
  const keptTarget = useLastValid(
    Object.keys(topCheck.problems).length === 0 ? parsedTarget : null,
  );
  // 身長や体型を変えて基準寸法が変わると、保っていた寸法が範囲の外になることがある。そのときは服を基準の形で出す
  const target =
    keptTarget && withinLimits(MEASUREMENT_KEYS, keptTarget, fit.base)
      ? keptTarget
      : null;
  const size = useMemo(
    () => (target ? sizeKeyValues(target, fit, topTable) : null),
    [fit, target, topTable],
  );
  const stretchRatio = TOPS[top].stretchRatio;
  const status = target ? fitStatus(target, fit, { stretchRatio }) : null;
  const trouserFit = useMemo(
    () => trouserFitAt(build, heightCm, trouserTable),
    [build, heightCm, trouserTable],
  );
  const trouserCheck = useMemo(
    () =>
      checkSizes(TROUSER_KEYS, trouserInput, trouserFit.base, TROUSER_VERIFIED),
    [trouserInput, trouserFit.base],
  );
  const keptTrouserTarget = useLastValid(
    Object.keys(trouserCheck.problems).length === 0
      ? parsedTrouserTarget
      : null,
  );
  const trouserTarget =
    keptTrouserTarget &&
    withinLimits(TROUSER_KEYS, keptTrouserTarget, trouserFit.base)
      ? keptTrouserTarget
      : null;
  const trouserSize = useMemo(
    () =>
      trouserTarget
        ? trouserKeyValues(trouserTarget, trouserFit, trouserTable)
        : null,
    [trouserFit, trouserTarget, trouserTable],
  );
  const trouserStatus = trouserTarget
    ? trouserFitStatus(trouserTarget, trouserFit)
    : null;

  const bodyMorphs = useMemo(
    () => ({
      ...buildKeyValues(build),
      ...heightKeyValues(heightCm, heightTable),
    }),
    [build, heightCm, heightTable],
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
    [build, heightCm, heightTable],
  );
  // シャツの中に着るTシャツの実寸。今は確認用の服で固定する
  const innerTarget = useMemo(() => topMeasurements(samples.tshirt), [samples]);
  const innerStatus = fitStatus(innerTarget, innerFit);
  const innerMorphs = useMemo(() => {
    const innerSize = sizeKeyValues(innerTarget, innerFit, heightTable);
    return {
      ...bodyMorphs,
      ...innerSize,
      width_folds: Math.max(innerSize.size_width, 0) / 10,
    };
  }, [bodyMorphs, innerFit, innerTarget, heightTable]);
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

  // 靴は、押し出しなどのeffectが同じオブジェクトかで見るので、選び直したときだけ作り直す
  const shoe = useMemo(() => {
    const found = presets.shoes.find((s) => s.id === shoeId);
    return found ? { id: found.id, path: models.presetUrl(found.path) } : null;
  }, [shoeId, models]);
  const hairPath = presets.hair.find((h) => h.id === hairId)?.path;

  /** TryOnSceneにそのまま渡す値（計算時間の計測などは各画面で足す） */
  const sceneProps = {
    heightScale: heightCm / heightTable.standard_cm,
    avatarUrl: models.avatar,
    trousersUrl: models.trousers,
    bodyMorphs,
    shirtUrl: models.tops[top].url,
    shirtMorphs,
    showShirt: status !== "tooSmall",
    innerUrl: models.tops.tshirt.url,
    innerMorphs,
    showInner,
    trouserMorphs,
    showTrousers: wearTrousers && trouserStatus !== "tooSmall",
    skinColor,
    hairUrl: hairPath ? models.presetUrl(hairPath) : null,
    faceUrl: models.presetUrl(presets.face.path),
    hairColor,
    shoe,
    sockColor,
  };

  return {
    gender,
    /** 3Dモデルの性別を切り替え、身長をその性別の標準に、服の実寸をその性別の確認用の服にする */
    selectGender: (g: ModelGender) => {
      setGender(g);
      setHeightInput(AVATAR_MODELS[g].tops.tshirt.table.standard_cm.toFixed(1));
      setInput(toInputs(topMeasurements(SAMPLES[g][top])));
      setTrouserInput(
        toTrouserInputs(trouserMeasurements(SAMPLES[g].trousers)),
      );
    },
    /** 今の性別の確認用の服 */
    samples,
    heightRangeCm: models.heightRangeCm,
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
    topCheck,
    fit,
    size,
    status,
    wearTrousers,
    setWearTrousers,
    trouserInput,
    setTrouserInput,
    trouserTarget,
    trouserCheck,
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
      setInput(toInputs(topMeasurements(samples[t])));
    },
  };
}

/** 入力の途中や不正な値でnullの間は、最後の正常な値を返す。valueは、中身が変わったときだけ別のオブジェクトにする */
function useLastValid<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
