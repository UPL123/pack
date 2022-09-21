import { denoPlugin, esbuild, path } from "./deps.ts";

function error(msg: string, code: number) {
  return new Response(
    `/* Pack - error */
throw new Error(\`[Pack] ${msg}\`);`,
    {
      headers: {
        "content-type": "text/javascript",
      },
      status: code,
    },
  );
}

export async function denoHandler(
  url: URL,
  build: typeof esbuild.build,
): Promise<Response> {
  const start = performance.now();
  const query = new URLSearchParams(url.search);
  const host = `${url.protocol}//${url.host}`;
  const api = "https://api.deno.land/modules";
  const cdn = "https://cdn.deno.land";
  const paths = url.pathname.split("/");
  paths.shift();
  paths.shift();

  const name = paths[0].split("@")[0];
  if (!name) {
    return error("Please insert a Deno package name.", 400);
  }

  let request = await fetch(`${api}/${name}`);
  let data = await request.json();
  if (!data.success && request.status === 404) {
    return error(`Cannot find package '${name}'`, 404);
  }

  request = await fetch(`${cdn}/${name}/meta/versions.json`);
  data = await request.json();
  if (request.status === 403) {
    return error(`Cannot fetch versions of '${name}'`, 403);
  }

  const version = paths[0].split("@")[1] || data.latest;
  if (!data.versions.includes(version)) {
    return error(`Cannot find version '${version}' on '${name}'`, 404);
  }

  paths.shift();

  let p = paths.join("/");

  if (!p) {
    request = await fetch(`${cdn}/${name}/versions/${version}/raw/mod.ts`);
    if (request.status === 403) {
      return error("Please insert a Deno path.", 400);
    }
    const end = performance.now();
    return new Response(
      `/* Pack - servered ${name}@${version} on ${Math.floor(end - start)}ms */
export * from '${host}/deno/${name}@${version}/mod.ts'`,
    );
  }

  request = await fetch(`${cdn}/${name}/versions/${version}/raw/${p}`);
  if (request.status === 403) {
    return error(`Cannot find '${p}' on '${name}@${version}'`, 404);
  }

  const text = await request.text();

  let minify = query.get("minify") === "true" ? true : false || true;
  let bundle = query.get("bundle") === "true" ? true : false || true;
  const ext = p.split(".")[p.split(".").length - 1];
  try {
    let result = await build({
      stdin: {
        contents: text,
        loader: ext as esbuild.Loader || "file",
      },
      format: "esm",
      target: query.get("target") || "es2022",
      minify,
      bundle,
      plugins: [
        {
          name: "pack-resolver",
          setup: (build) => {
            build.onResolve(
              { filter: /^@?(([a-z0-9]+-?)+\/?)+$/ },
              (args) => {
                return {
                  path: `${host}/deno/${name}@${version}/${args.path}`,
                  external: true,
                };
              },
            );
            build.onResolve(
              {
                filter:
                  /\.?((\/|\\|\/\/|https?:\\\\|https?:\/\/)[a-z0-9_@\-^!#$%&+={}.\/\\\[\]]+)$/i,
              },
              async (args) => {
                return {
                  path: `${host}/deno/${name}@${version}/${
                    path.join(p, "..", args.path).replace("\\", "/")
                  }`,
                  external: true,
                };
              },
            );
          },
        },
      ],
      sourcemap: true,
      write: false,
    });
    let content = result.outputFiles[0].text;
    const end = performance.now();
    return new Response(
      `/* Pack - servered on ${Math.floor(end - start)}ms */
${content}`,
      {
        headers: {
          "content-type": "text/javascript",
        },
      },
    );
  } catch (e) {
    return error(`Compile error: ${e.stack}`, 406);
  }
}
