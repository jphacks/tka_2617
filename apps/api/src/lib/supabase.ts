import { createClient } from "@supabase/supabase-js";
import type { Database } from "#src/lib/database.types";
import { env } from "#src/lib/env";

// secret key は RLS を素通りするので、クライアントを作るのはこのファイルだけにする。
// Databaseの型は、migrationから作ったもの（pnpm --filter @pitari/api db:types）
export const supabase = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
