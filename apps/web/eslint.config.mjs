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
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
