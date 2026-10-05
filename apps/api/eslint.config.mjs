import { defineConfig, globalIgnores } from "eslint/config";
import { relativeImport, sharedConfig } from "../../eslint.shared.mjs";

const relative = relativeImport("#src/");
const supabaseClient = {
  group: ["@supabase/supabase-js"],
  message: "Supabase のクライアントは #src/lib/supabase から使う",
};
// group は gitignore 書式で先頭の # がコメント扱いになるため、正規表現で書く
const otherLayers = {
  regex: "^#src/(services|routes)/",
  message: "services 同士や routes は呼ばない。共通の処理は #src/lib/ に置く",
};

function restrictImports(...patterns) {
  return {
    "@typescript-eslint/no-restricted-imports": ["error", { patterns }],
  };
}

export default defineConfig([
  ...sharedConfig(import.meta.dirname),
  {
    files: ["src/**/*.ts"],
    rules: restrictImports(relative, supabaseClient),
  },
  {
    files: ["src/lib/supabase.ts"],
    rules: restrictImports(relative),
  },
  {
    files: ["src/services/**/*.ts"],
    rules: restrictImports(relative, supabaseClient, otherLayers),
  },
  globalIgnores(["src/lib/database.types.ts"]),
]);
