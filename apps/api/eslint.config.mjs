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

const dbFromRoutes = {
  regex: "^#src/lib/supabase$",
  message:
    "DB は services で触る。routes は受け取りと検証、返す形を整えるところまで",
};

// Hono RPC は、つなげて書いたルートだけを型にする。
// `v1.get(...)` のように別の文で足すと、web から型が見えなくなるため止める
const routeStatement = {
  selector:
    "ExpressionStatement > CallExpression > MemberExpression.callee[object.type='Identifier'][property.name=/^(get|post|put|patch|delete|all|on|use|route)$/]",
  message:
    "ルートは new Hono().get(...).post(...) のように、1つの式につなげて書く（別の文で足すと web から型が見えない）",
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
    files: ["src/app.ts", "src/routes/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", routeStatement] },
  },
  {
    files: ["src/routes/**/*.ts"],
    rules: restrictImports(relative, supabaseClient, dbFromRoutes),
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
