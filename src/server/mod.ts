import { npmHandler } from "../npm/mod.ts";
import { esbuild, http, path } from "./deps.ts";

export async function server() {
  await esbuild.initialize({
    wasmURL: "https://deno.land/x/esbuild@v0.15.7/esbuild.wasm",
    worker: false,
  });
  http.serve(async (req) => {
    const url = new URL(req.url);

    if (url.pathname.length >= 2) {
      return npmHandler(url, esbuild.build);
    }

    const body = await Deno.readFile(path.join(Deno.cwd(), "index.html"));
    return new Response(body, {
      headers: {
        "content-type": "text/html",
      },
    });
  });
}
