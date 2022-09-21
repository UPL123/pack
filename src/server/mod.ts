import { npmHandler } from "../npm/mod.ts";
import { denoHandler } from "../deno/mod.ts";
import { esbuild, http, path } from "./deps.ts";

export async function server() {
  await esbuild.initialize({
    wasmURL: "https://deno.land/x/esbuild@v0.14.51/esbuild.wasm",
    worker: false,
  });
  const build = esbuild.build;
  http.serve(async (req) => {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/npm")) {
      return npmHandler(url, build);
    }

    if (url.pathname.startsWith("/deno")) {
      return denoHandler(url, build);
    }

    const body = await Deno.readFile(path.join(Deno.cwd(), "index.html"));
    return new Response(body, {
      headers: {
        "content-type": "text/html",
      },
    });
  });
  esbuild.stop();
}
