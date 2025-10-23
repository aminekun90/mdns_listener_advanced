// eslint.config.ts
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint-define-config";

export default defineConfig({
  files: ["src/**/*.ts", "src/**/*.js", "__tests__/**/*.ts", "__test__/**/*.js"],

  ignores: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**/*",
  ],

  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      project: "./tsconfig.json",
    },
    globals: {
      process: "readonly",
      __dirname: "readonly",
      console: "readonly",
      describe: "readonly",
      it: "readonly",
      expect: "readonly",
      beforeEach: "readonly",
      afterEach: "readonly",
      beforeAll: "readonly",
      afterAll: "readonly",
    },
  },

  plugins: {
    "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    prettier: require("eslint-plugin-prettier"),
    vitest: require("eslint-plugin-vitest"),
  },

  rules: {
    "no-console": "warn",
    "prettier/prettier": ["error", { endOfLine: "auto" }],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },

  linterOptions: {
    reportUnusedDisableDirectives: "warn",
  },
});
