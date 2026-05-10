import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Muse repo lint config (round 172).
 *
 * Goal: a baseline gate that catches genuine bug patterns without
 * fighting the existing codebase. Stylistic + opinionated rules are
 * deliberately kept off (or as `warn`) so this iter can land green.
 * Future iters tighten rule by rule as the codebase is swept.
 *
 * The codebase is type-aware where it helps (typescript-eslint
 * recommended) but not project-aware (no `parserOptions.project`) —
 * lighter to run, and we already have `pnpm check` for full type
 * verification.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.muse/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "scripts/**",
      "apps/web/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-empty-pattern": "warn",
      "no-control-regex": "off",
      "no-useless-escape": "warn",
      "no-unsafe-finally": "warn",
      "no-async-promise-executor": "warn",
      "no-prototype-builtins": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-with": "error",
      "prefer-const": "warn"
    }
  },
  {
    files: ["**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
