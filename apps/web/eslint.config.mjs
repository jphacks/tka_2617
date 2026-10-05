import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import { relativeImport, sharedConfig } from "../../eslint.shared.mjs";

export default defineConfig([
  ...nextVitals,
  ...sharedConfig(import.meta.dirname),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            relativeImport("@/"),
            {
              group: ["@supabase/*"],
              message:
                "web は Supabase に触れない。データは api 経由で取る（docs/adr/0001-separate-web-and-api.md）",
            },
            {
              group: ["@pitari/api"],
              allowTypeImports: true,
              message: "api からは型だけ使える。import type で書く",
            },
          ],
        },
      ],
      // NEXT_PUBLIC_ の値はブラウザ向けのコードに埋め込まれるので、秘密に見える名前は止める
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_.*(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|KEY)/]",
          message:
            "秘密に見える NEXT_PUBLIC_ の環境変数はブラウザに埋め込まれる。src/server/ で NEXT_PUBLIC_ なしの名前で読む（公開してよい値なら、理由を書いて eslint-disable する）",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
