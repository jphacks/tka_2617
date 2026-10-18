import { z } from "zod";
import tshirtHeightJson from "@/../public/models/tshirt_male_height.json";
import presetsJson from "@/../public/presets/presets.json";

// アバターの設定。ログインを入れるまでは、ブラウザのlocalStorageに保存する（docs/adr/0036-avatar-settings-in-browser.md）

/** 体型4つ。standardはBasisそのもの（キーなし）。がっしり＝筋肉、ぽっちゃり＝体重 */
export const BUILDS = ["slim", "standard", "broad", "chubby"] as const;
export type Build = (typeof BUILDS)[number];
export const BUILD_LABELS: Record<Build, string> = {
  slim: "細身",
  standard: "標準",
  broad: "がっしり",
  chubby: "ぽっちゃり",
};

export const GENDERS = ["male", "female", "unspecified"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = {
  male: "男性",
  female: "女性",
  unspecified: "選ばない",
};

/**
 * 3Dモデルの性別ごとの、入力できる身長（cm）。Blenderで基準寸法とキーの効き方を測った範囲。
 * 女性のモデルは標準の身長（159cm）が低いので、範囲を低い側へずらしてある
 */
export const HEIGHT_RANGE_CM = {
  male: [150, 195],
  female: [140, 185],
} as const satisfies Record<string, readonly [number, number]>;
/** 3Dモデルの性別。Blenderが性別ごとに、同じキー・同じ表の形でglbとJSONを書き出す */
export type ModelGender = keyof typeof HEIGHT_RANGE_CM;

/** 設定の性別で使う3Dモデル。「選ばない」は男性（docs/adr/0043-show-female-avatar-by-gender.md） */
export function modelGenderOf(gender: Gender): ModelGender {
  return gender === "female" ? "female" : "male";
}

/** 設定の性別で入力できる身長（cm） */
export function heightRangeOf(gender: Gender) {
  return HEIGHT_RANGE_CM[modelGenderOf(gender)];
}

// 骨格は女性のときだけ聞く。今は3Dに反映しない（骨格のキーは候補要件）
export const BODY_FRAMES = ["straight", "wave", "natural", "unknown"] as const;
export type BodyFrame = (typeof BODY_FRAMES)[number];
export const BODY_FRAME_LABELS: Record<BodyFrame, string> = {
  straight: "ストレート",
  wave: "ウェーブ",
  natural: "ナチュラル",
  unknown: "わからない",
};

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const AvatarSettingsSchema = z.object({
  gender: z.enum(GENDERS),
  // 性別ごとの範囲には、読んだあとにwithGenderで収める
  heightCm: z
    .number()
    .min(HEIGHT_RANGE_CM.female[0])
    .max(HEIGHT_RANGE_CM.male[1]),
  build: z.enum(BUILDS),
  bodyFrame: z.enum(BODY_FRAMES).nullable(),
  skinColor: hexColor,
  hairId: z.string().nullable(),
  hairColor: hexColor,
});
export type AvatarSettings = z.infer<typeof AvatarSettingsSchema>;

// 初回の登録では、性別・身長・体型・骨格だけを聞く。肌の色と髪は、この値で始めてアバターの画面で変える
export const defaultAvatarSettings: AvatarSettings = {
  gender: "unspecified",
  // 3Dモデルの標準の身長。体の形がいちばん正確になる
  heightCm: tshirtHeightJson.standard_cm,
  build: "standard",
  bodyFrame: null,
  skinColor: presetsJson.skinColors[1],
  hairId: presetsJson.hair[0].id,
  hairColor: presetsJson.hairColors[1],
};

/** 性別を変える。骨格は女性のときだけ持ち、身長はその性別の3Dモデルで入力できる範囲に収める */
export function withGender(
  settings: AvatarSettings,
  gender: Gender,
): AvatarSettings {
  const [min, max] = heightRangeOf(gender);
  return {
    ...settings,
    gender,
    heightCm: Math.min(Math.max(settings.heightCm, min), max),
    bodyFrame: gender === "female" ? (settings.bodyFrame ?? "unknown") : null,
  };
}

/**
 * 入力欄の文字を身長（cm）にする。空欄、数値でないもの、3Dで変えられる範囲（3Dモデルの性別ごと、heightRangeOf）の外はnull
 */
export function heightFromInput(
  input: string,
  [min, max]: readonly [number, number],
): number | null {
  const heightCm = Number(input);
  return input.trim() !== "" && heightCm >= min && heightCm <= max
    ? heightCm
    : null;
}

const storageKey = "pitari.avatar";

/**
 * 設定を読み書きする。useSyncExternalStoreに渡せるよう、読んだ値を同じオブジェクトのまま返す。
 * サイトのデータを禁止したブラウザでは、window.localStorageを読むだけで例外になるので、storageは関数で受け取る
 */
export function createAvatarSettingsStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
) {
  // undefinedは、まだ読んでいない。nullは、まだ登録していない
  let settings: AvatarSettings | null | undefined;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: (): AvatarSettings | null => {
      if (settings === undefined) settings = load(storage);
      return settings;
    },
    save: (next: AvatarSettings) => {
      settings = next;
      try {
        storage().setItem(storageKey, JSON.stringify(next));
      } catch {
        // 保存できなくても、開いている間は使える
      }
      for (const listener of listeners) listener();
    },
  };
}

/** 画面で使う設定。ページごとに作ると、マイで登録したあとに今日の画面へ戻っても、前に読んだ「未登録」のまま残る */
export const avatarSettingsStore = createAvatarSettingsStore(
  () => window.localStorage,
);

function load(storage: () => Pick<Storage, "getItem">): AvatarSettings | null {
  try {
    const value: unknown = JSON.parse(storage().getItem(storageKey) ?? "null");
    const parsed = AvatarSettingsSchema.safeParse(value);
    return parsed.success ? repair(parsed.data) : null;
  } catch {
    return null;
  }
}

// presets.jsonから髪を消しても、保存していた人に登録をやり直させない
function repair(settings: AvatarSettings): AvatarSettings {
  const hairExists =
    settings.hairId === null ||
    presetsJson.hair.some((hair) => hair.id === settings.hairId);
  return withGender(
    {
      ...settings,
      hairId: hairExists ? settings.hairId : defaultAvatarSettings.hairId,
    },
    settings.gender,
  );
}
