import js from "@eslint/js";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import vitest from "eslint-plugin-vitest";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
export default defineConfig([
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Prettier (First, to set baseline)
  prettierRecommended,

  {
    files: ["src/**/*.{ts,js}", "__tests__/**/*.{ts,js}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    rules: {
      "no-console": "warn",

      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",

      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },

  {
    files: ["__tests__/**/*.{ts,js}", "**/*.test.ts"],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "off",
    },
  },
]);
