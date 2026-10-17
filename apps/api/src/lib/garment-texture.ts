import { z } from "zod";

export const textureAcceptedSchema = z.object({
  status: z.literal("accepted"),
});
export const textureRequestResultSchema = z.discriminatedUnion("status", [
  textureAcceptedSchema,
  z.object({ status: z.literal("failed"), message: z.string() }),
]);
export type TextureRequestResult = z.infer<typeof textureRequestResultSchema>;
export type BackPhotoResponse = { id: string; texture: TextureRequestResult };

// 作成中・失敗は推論サービスが持つ。完成したものだけを、apiがStorageに移して画像のIDで返す。
// 作り直しの間や、作り直しに失敗したときも、今の写真から前に作ったテクスチャがあれば、そのIDを返す
export type TextureStatus =
  | { status: "none" }
  | { status: "processing"; imageId?: string }
  | { status: "done"; imageId: string }
  | { status: "failed"; message: string; imageId?: string };
