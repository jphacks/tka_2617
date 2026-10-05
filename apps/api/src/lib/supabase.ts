import { createClient } from "@supabase/supabase-js";
import { env } from "#src/lib/env";

// secret key は RLS を素通りするので、クライアントを作るのはこのファイルだけにする
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
