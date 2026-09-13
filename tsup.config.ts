import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  // Les types ne sont pas produits ici : tsup injecte `baseUrl` dans sa passe
  // de déclaration, et TypeScript 6 refuse cette option dépréciée. C'est ce
  // qui faisait échouer le build. Ils sont générés par `tsc` via
  // tsconfig.build.json — voir le script `build:types`.
  dts: false,
  clean: true,
  sourcemap: false,
  outDir: "dist",
  target: "es2022",
  bundle: true,
  external: ["multicast-dns"],
});