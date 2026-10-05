// ESLint は 9 に留めている。eslint-config-next が使うプラグイン（react / import / jsx-a11y）が 10 に未対応のため
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export function sharedConfig(tsconfigRootDir) {
  return [
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        // DeepFashion2 の13カテゴリを switch で分けるとき、case の書き漏れを防ぐ
        "@typescript-eslint/switch-exhaustiveness-check": "error",
      },
    },
    {
      files: ["**/*.mjs", "**/*.js"],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  ];
}

export function relativeImport(alias) {
  return {
    group: ["./*", "../*"],
    message: `相対パスは分かりにくいので、エイリアス（${alias}）で import する`,
  };
}
