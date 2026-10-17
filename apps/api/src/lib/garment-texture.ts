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
