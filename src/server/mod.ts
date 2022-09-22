import { npmHandler } from "../npm/mod.ts";
import { denoHandler } from "../deno/mod.ts";
import { http, path } from "./deps.ts";
import { startEsbuild } from "../util/esbuild.ts";

export async function server() {
  const service = await startEsbuild();
  http.serve(async (req) => {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/npm")) {
      return npmHandler(url, service);
    }

    if (url.pathname.startsWith("/deno")) {
      return denoHandler(url, service);
    }

    const body = await Deno.readFile(path.join(Deno.cwd(), "index.html"));
    return new Response(body, {
      headers: {
        "content-type": "text/html",
      },
    });
  });
}
