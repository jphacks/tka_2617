import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import { relativeImport, sharedConfig } from "../../eslint.shared.mjs";

// server-only を import しておけば、クライアントから読み込まれたときに build で止まる。
// 書き忘れると止まらないので、src/server/ では書いてあるかを確かめる
const requireServerOnly = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      missing:
        'src/server/ のファイルには import "server-only" を書く（クライアントから読み込まれたら build で止めるため）',
    },
  },
  create(context) {
    return {
      Program(program) {
        const imported = program.body.some(
          (node) =>
            node.type === "ImportDeclaration" &&
            node.source.value === "server-only",
        );
        if (!imported) {
          context.report({ node: program, messageId: "missing" });
        }
      },
    };
  },
};

const importPatterns = [
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
];

// NEXT_PUBLIC_ の値はブラウザ向けのコードに埋め込まれるので、秘密に見える名前は止める
const secretName =
  "/^NEXT_PUBLIC_.*(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|KEY)/";
const secretPublicEnvMessage =
  "秘密に見える NEXT_PUBLIC_ の環境変数はブラウザに埋め込まれる。src/server/ で NEXT_PUBLIC_ なしの名前で読む（公開してよい値なら、理由を書いて eslint-disable する）";
const secretPublicEnv = [
  {
    selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=${secretName}]`,
    message: secretPublicEnvMessage,
  },
  {
    // process.env["NEXT_PUBLIC_..."] の書き方も止める
    selector: `MemberExpression[computed=true][object.object.name='process'][object.property.name='env'][property.value=${secretName}]`,
    message: secretPublicEnvMessage,
  },
];

// 外部 API や api の呼び出し先がブラウザに見えないよう、src/server/ の外では止める。
// URL を変数で渡す書き方までは見分けられない
const outsideServer = {
  honoClient: {
    group: ["hono/client"],
    message: "api のクライアントは src/server/ の中だけで作る",
  },
  absoluteFetch: [
    {
      selector:
        "CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^https?:/]",
      message:
        "外部の URL を直接 fetch しない。呼び出しは src/server/ に置き、画面からは /api/* を呼ぶ",
    },
    {
      selector:
        "CallExpression[callee.name='fetch'][arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^https?:/]",
      message:
        "外部の URL を直接 fetch しない。呼び出しは src/server/ に置き、画面からは /api/* を呼ぶ",
    },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...sharedConfig(import.meta.dirname),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: importPatterns },
      ],
      "no-restricted-syntax": ["error", ...secretPublicEnv],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [...importPatterns, outsideServer.honoClient] },
      ],
      "no-restricted-syntax": [
        "error",
        ...secretPublicEnv,
        ...outsideServer.absoluteFetch,
      ],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    plugins: {
      pitari: { rules: { "require-server-only": requireServerOnly } },
    },
    rules: { "pitari/require-server-only": "error" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
