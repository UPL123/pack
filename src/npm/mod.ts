// Imports
import {
  esbuild,
  path,
  readAll,
  readerFromStreamReader,
  semver,
  Untar,
} from "./deps.ts";

function error(msg: string) {
  return new Response(
    `/* Pack v1.0.0 - Error */
throw new Error(\`[Pack] ${msg}\`)`,
    {
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "text/javascript",
      },
    },
  );
}

export async function npmHandler(
  url: URL,
  request: Request,
): Promise<Response> {
  // Basic setup
  const start = performance.now();
  const host = `${url.protocol}//${url.host}`;
  const query = new URLSearchParams(url.search);
  const paths = url.pathname.split("/");
  paths.shift();

  const name = paths[0].split("@")[0];
  let version = paths[0].split("@")[1] || "latest";

  paths.shift();

  const submodule = paths.join("/");

  const registry = query.get("registry") || "https://registry.npmjs.org";
  let req = await fetch(`${registry}/${name}/${version}`);
  let data = await req.json();

  if (!data || req.status == 404) {
    return error(
      `Cannot find '${name}'`,
    );
  }

  if (req.status == 405 && !semver.valid(version)) {
    req = await fetch(`${registry}/${name}`);
    data = await req.json();

    if (data.error) {
      return error(
        `Cannot find '${name}@${version}'`,
      );
    }

    if (!data["dist-tags"][version]) {
      return error(`Cannot find version '${version}' for '${name}'`);
    }

    version = data["dist-tags"][version];

    req = await fetch(`${registry}/${name}/${version}`);
    data = await req.json();
  }

  let dest = "";
  const end = performance.now();

  // If is a sub module
  if (submodule !== "") {
    try {
      let exports: string[] = [];
      for (var key in data.exports) {
        exports.push(key);
      }
      let exp = exports.filter((x: string) => x.endsWith("*"));
      if (exp[0]) {
        for (var ex of exp) {
          if (submodule.startsWith(ex.replace("*", "").replace("./", ""))) {
            dest = data.exports[ex].import.replace("./", "").replace(
              "*",
              submodule.replace(ex.replace("*", "").replace("./", ""), ""),
            );
            break;
          }
          dest = data.exports["./" + submodule].import.replace("./", "");
        }
      } else {
        dest = data.exports["./" + submodule].import.replace("./", "");
      }
      // If is normal package
      return new Response(
        `/* Pack - Servered '${name}@${data.version}/${submodule}' on ${
          Math.floor(end - start)
        }ms */
export * from '${host}/${name}@${data.version}/${dest}';`,
        {
          headers: {
            "access-control-allow-origin": "*",
            "content-type": "text/javascript",
          },
        },
      );
    } catch (e) {
      // Is a file
      dest = submodule;
      if (data.exports) {
        if (data.exports["./" + submodule]) {
          dest = data.exports["./" + submodule].import.replace("./", "");
        }
      }
      const tarball = data.dist.tarball;
      const res = await fetch(tarball, { keepalive: true });
      const stream = res.body?.pipeThrough(new DecompressionStream("gzip"))
        .getReader();
      const untar = new Untar(readerFromStreamReader(stream!));
      let text = "";
      for await (const entry of untar) {
        if (entry.fileName == "package/" + dest) {
          text = new TextDecoder().decode(await readAll(entry));
        }
      }
      if (text == "") {
        return error(`Cannot find file '${name}@${data.version}/${dest}'`);
      }
      try {
        let minify = query.get("minify") === "true" ? true : false || true;
        let bundle = query.get("bundle") === "true" ? true : false || true;
        let content = text;
        if (dest.endsWith("js" || ".mjs" || "cjs")) {
          // Initialize esbuild
          await esbuild.initialize({
            wasmURL: "https://deno.land/x/esbuild@v0.15.7/esbuild.wasm",
            worker: true,
          });
          let result = await esbuild.build({
            stdin: {
              contents: text,
            },
            format: "esm",
            target: query.get("target") || "es2022",
            minify,
            bundle,
            plugins: [
              {
                name: "pack-resolver",
                setup: (build) => {
                  // Module:  /^@?(([a-z0-9]+-?)+\/?)+$/
                  // Dir: /^(\/[^\/]+){0,2}\/?$/gm
                  build.onResolve(
                    { filter: /^@?(([a-z0-9]+-?)+\/?)+$/ },
                    (args) => {
                      return {
                        path: `${host}/${args.path}`,
                        external: true,
                      };
                    },
                  );
                  build.onResolve(
                    {
                      filter:
                        /\.?((\/|\\|\/\/|https?:\\\\|https?:\/\/)[a-z0-9_@\-^!#$%&+={}.\/\\\[\]]+)$/i,
                    },
                    (args) => {
                      return {
                        path: `${host}/${name}@${data.version}/${
                          path.join(dest, "..", args.path).replace("\\", "/")
                        }`,
                        external: true,
                      };
                    },
                  );
                },
              },
            ],
            write: false,
          });
          content = result.outputFiles[0].text;
        }
        esbuild.stop();
        if (!data.exports) {
          dest = data.types;
        } else {
          if (data.exports["./" + submodule]) {
            dest = data.exports["./" + submodule].types;
          } else {
            dest = data.types;
          }
        }
        const end = performance.now();
        return new Response(
          `/* Pack - Compiled in ${Math.floor(end - start)}ms*/
${content}`,
          {
            headers: {
              "access-control-allow-origin": "*",
              "content-type": "text/javascript",
              "x-typescript-types": `${host}/${name}@${data.version}/${dest}`,
            },
          },
        );
      } catch (e) {
        console.error(e.stack);
        return error(`Compile error: ${e.stack}`);
      }
    }
  }

  dest = data.main.replace("./", "");
  if (data.module) dest = data.module.replace("./", "");

  let types = data.types || data.typings;

  // If is normal package
  return new Response(
    `/* Pack - Servered '${name}@${data.version}' on ${
      Math.floor(end - start)
    }ms */
export * from '${host}/${name}@${data.version}/${dest}';`,
    {
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "text/javascript",
        "x-typescript-types": `${host}/${name}@${data.version}/${types}`,
      },
    },
  );
}
