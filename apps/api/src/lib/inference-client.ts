import { env } from "#src/lib/env";
import { HttpError } from "#src/lib/http-error";

export async function requestInference(
  path: "/status" | "/detect",
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
      signal: AbortSignal.timeout(120_000),
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
