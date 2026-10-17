import femaleLongsleeveJson from "@/../public/models/longsleeve_female_height.json";
import maleLongsleeveJson from "@/../public/models/longsleeve_male_height.json";
import femaleShirtJson from "@/../public/models/shirt_female_height.json";
import maleShirtJson from "@/../public/models/shirt_male_height.json";
import femaleTrousersJson from "@/../public/models/trousers_female_height.json";
import maleTrousersJson from "@/../public/models/trousers_male_height.json";
import femaleTshirtJson from "@/../public/models/tshirt_female_height.json";
import maleTshirtJson from "@/../public/models/tshirt_male_height.json";
import { HEIGHT_MAX_CM, HEIGHT_MIN_CM } from "@/lib/avatar-settings";
import { HeightTableSchema } from "@/lib/garment";
import { TrouserTableSchema } from "@/lib/trousers";

/** 3Dモデルの性別。Blenderが性別ごとに、同じキー・同じ表の形でglbとJSONを書き出す */
export type ModelGender = "male" | "female";

function modelsOf(
  gender: ModelGender,
  json: {
    tshirt: unknown;
    longsleeve: unknown;
    shirt: unknown;
    trousers: unknown;
  },
  heightRangeCm: readonly [number, number],
) {
  const url = (name: string) => `/models/${name}_${gender}.glb`;
  const top = (name: "tshirt" | "longsleeve" | "shirt") => ({
    url: url(name),
    table: HeightTableSchema.parse(json[name]),
  });
  return {
    avatar: url("avatar"),
    trousers: url("trousers"),
    tops: {
      tshirt: top("tshirt"),
      longsleeve: top("longsleeve"),
      shirt: top("shirt"),
    },
    trouserTable: TrouserTableSchema.parse(json.trousers),
    /** 入力できる身長（cm）。Blenderで基準寸法とキーの効き方を測った範囲 */
    heightRangeCm,
  };
}

/**
 * 性別ごとの3Dモデル：glbのパス、Blenderが書き出した表（小さいので、取りに行かずにバンドルに入れる）、入力できる身長。
 * 女性の体（avatar_female.glb）には、押し出しにだけ使う見えない体（avatar_fit）も入っている。
 * 女性は、ブラウザで確かめるまで開発用の画面（/dev/tryon）でだけ使う。本番の画面は男性
 */
export const AVATAR_MODELS = {
  male: modelsOf(
    "male",
    {
      tshirt: maleTshirtJson,
      longsleeve: maleLongsleeveJson,
      shirt: maleShirtJson,
      trousers: maleTrousersJson,
    },
    [HEIGHT_MIN_CM, HEIGHT_MAX_CM],
  ),
  female: modelsOf(
    "female",
    {
      tshirt: femaleTshirtJson,
      longsleeve: femaleLongsleeveJson,
      shirt: femaleShirtJson,
      trousers: femaleTrousersJson,
    },
    [140, 185],
  ),
} satisfies Record<ModelGender, ReturnType<typeof modelsOf>>;
