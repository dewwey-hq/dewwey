import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested git worktrees (created by Claude Code sessions) live on disk
    // inside the repo but aren't part of it — ESLint's flat config doesn't
    // ignore dotfolders by default, so without this it double-lints them.
    ".claude/**",
  ]),
  {
    // Plain Node/CommonJS scripts and the Lambda handler aren't part of the
    // Next.js/React app at all — turn off React/ESM-oriented rules that only
    // make sense for app code. (`useWeddingExtraction` etc. here are plain
    // helper functions, not React hooks — the naming just triggers the
    // react-hooks plugin's use-prefix heuristic.)
    files: ["scripts/**/*.js", "lambdas/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Several existing effect-driven state syncs predate this rule and are
    // deliberate (sync derived UI state on prop/dependency change). Keep the
    // signal for new code without blocking CI on working, existing code.
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
