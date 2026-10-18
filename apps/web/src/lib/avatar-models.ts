import femaleLongsleeveJson from "@/../public/models/longsleeve_female_height.json";
import maleLongsleeveJson from "@/../public/models/longsleeve_male_height.json";
import femaleShirtJson from "@/../public/models/shirt_female_height.json";
import maleShirtJson from "@/../public/models/shirt_male_height.json";
import femaleTrousersJson from "@/../public/models/trousers_female_height.json";
import maleTrousersJson from "@/../public/models/trousers_male_height.json";
import femaleTshirtJson from "@/../public/models/tshirt_female_height.json";
import maleTshirtJson from "@/../public/models/tshirt_male_height.json";
import { HEIGHT_RANGE_CM, type ModelGender } from "@/lib/avatar-settings";
import { HeightTableSchema } from "@/lib/garment";
import { TrouserTableSchema } from "@/lib/trousers";

function modelsOf(
  gender: ModelGender,
  json: {
    tshirt: unknown;
    longsleeve: unknown;
    shirt: unknown;
    trousers: unknown;
  },
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
    heightRangeCm: HEIGHT_RANGE_CM[gender],
    /**
     * presets.jsonの髪・靴・顔のパーツのglbのパスを、この性別の体に合わせたものにする。
     * 女性はBlenderが同じ名前でpresets/female/の下に書き出す
     */
    presetUrl: (path: string) =>
      gender === "male"
        ? path
        : path.replace(/^\/presets\//, `/presets/${gender}/`),
  };
}

/**
 * 性別ごとの3Dモデル：glbのパス、Blenderが書き出した表（小さいので、取りに行かずにバンドルに入れる）、入力できる身長。
 * 女性の体（avatar_female.glb）には、押し出しにだけ使う見えない体（avatar_fit）も入っている。
 * 設定の性別が女性なら女性、男性と「選ばない」は男性（modelGenderOf）
 */
export const AVATAR_MODELS = {
  male: modelsOf("male", {
    tshirt: maleTshirtJson,
    longsleeve: maleLongsleeveJson,
    shirt: maleShirtJson,
    trousers: maleTrousersJson,
  }),
  female: modelsOf("female", {
    tshirt: femaleTshirtJson,
    longsleeve: femaleLongsleeveJson,
    shirt: femaleShirtJson,
    trousers: femaleTrousersJson,
  }),
} satisfies Record<ModelGender, ReturnType<typeof modelsOf>>;
