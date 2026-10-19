import { env } from "#src/lib/env";
import { HttpError } from "#src/lib/http-error";

export async function requestInference(
  path: "/status" | "/detect" | "/textures",
  form?: FormData,
): Promise<unknown> {
  if (!env.INFERENCE_TOKEN)
    throw new HttpError(
      503,
      "推論サービスを設定してください。寸法の直接入力は利用できます",
    );
  try {
    const response = await fetch(new URL(path, env.INFERENCE_URL), {
      method: form ? "POST" : "GET",
      headers: { Authorization: `Bearer ${env.INFERENCE_TOKEN}` },
      body: form,
      // テクスチャはキューの受付だけなので、写真保存を推論の完了時間まで待たせない。
      signal: AbortSignal.timeout(path === "/textures" ? 15_000 : 120_000),
    });
    if (response.status === 429)
      throw new HttpError(
        429,
        "別の写真を処理しています。少し待って再試行してください",
      );
    if (response.status === 400)
      throw new HttpError(400, "画像・A4の四隅・服の範囲を確認してください");
    if (!response.ok)
      throw new HttpError(
        503,
        "推論サービスを利用できません。設定と起動状況を確認してください",
      );
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      "推論サービスに接続できません。起動状況を確認してください",
    );
  }
}

// 服を消したあとに、推論サービスのPCに残る作業と写真を片付ける。設定が無ければnull、片付けられなければfalse。
// 服の行と画像はもう消してあるので、失敗しても呼び出し側は削除を止めない
export async function deleteFromInference(
  path: string,
): Promise<boolean | null> {
  if (!env.INFERENCE_TOKEN) return null;
  try {
    const response = await fetch(new URL(path, env.INFERENCE_URL), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.INFERENCE_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// テクスチャの状態と画像を読む。404（作業が無い）の扱いは呼び出し側で決めるので、応答をそのまま返す。
// 設定が無い、またはつながらないときはnull
export async function getFromInference(path: string): Promise<Response | null> {
  if (!env.INFERENCE_TOKEN) return null;
  try {
    return await fetch(new URL(path, env.INFERENCE_URL), {
      headers: { Authorization: `Bearer ${env.INFERENCE_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }
}
