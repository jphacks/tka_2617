/** 3Dモデルの性別。Blenderが性別ごとに、同じキー・同じ表の形でglbとJSONを書き出す */
export type ModelGender = "male" | "female";

/**
 * 性別ごとの3Dモデルのパス。女性の体（avatar_female.glb）には、押し出しにだけ使う見えない体（avatar_fit）も入っている。
 * 性別を切り替える画面は、下のメニューの作り直し（#122）の後で足す。それまでは男性を使う
 */
export function modelUrls(gender: ModelGender) {
  const url = (name: string) => `/models/${name}_${gender}.glb`;
  return {
    avatar: url("avatar"),
    trousers: url("trousers"),
    tops: {
      tshirt: url("tshirt"),
      longsleeve: url("longsleeve"),
      shirt: url("shirt"),
    },
  };
}
