import { npmHandler } from "../npm/mod.ts";
import { http, path } from "./deps.ts";

export function server() {
  http.serve(async (req) => {
    const url = new URL(req.url);

    if (url.pathname.length >= 2) {
      return npmHandler(url, req);
    }

    const body = await Deno.readFile(path.join(Deno.cwd(), "index.html"));
    return new Response(body, {
      headers: {
        "content-type": "text/html",
      },
    });
  });
}
