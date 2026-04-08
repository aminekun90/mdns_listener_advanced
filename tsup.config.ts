import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  dts: false, // <--- SHUT THIS OFF to stop the tsup crash
  clean: true,
  sourcemap: false,
  outDir: "dist",
  target: "es2022",
  bundle: true,
  external: ["multicast-dns"],
});