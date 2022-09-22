import { esbuild } from "./deps.ts";

export async function startEsbuild() {
  await esbuild.initialize({
    wasmURL: "https://deno.land/x/esbuild@v0.14.51/esbuild.wasm",
    worker: false,
  });
  return esbuild;
}
