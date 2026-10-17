// アバターの設定の名前と選べる値

/** 体型4つ。standardはBasisそのもの（キーなし）。がっしり＝筋肉、ぽっちゃり＝体重 */
export const BUILDS = ["slim", "standard", "broad", "chubby"] as const;
export type Build = (typeof BUILDS)[number];
export const BUILD_LABELS: Record<Build, string> = {
  slim: "細身",
  standard: "標準",
  broad: "がっしり",
  chubby: "ぽっちゃり",
};

/** 入力できる身長（cm）。Blenderで基準寸法とキーの効き方を測った範囲 */
export const HEIGHT_MIN_CM = 150;
export const HEIGHT_MAX_CM = 195;
