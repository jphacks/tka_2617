import { z } from "zod";

// 設定漏れに起動時に気づけるよう、使う前にまとめて検証する
const envSchema = z.object({
  PORT: z.coerce.number().int().default(3001),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  INTERNAL_API_TOKEN: z.string().min(32),
  DEMO_PROFILE_ID: z.uuid(),
});

export const env = envSchema.parse(process.env);
