// Imports
import {
  esbuild,
  path,
  readAll,
  readerFromStreamReader,
  semver,
  Untar,
} from "./deps.ts";

function error(msg: string, code: number) {
  return new Response(
    `/* Pack v1.0.0 - Error */
throw new Error(\`[Pack] ${msg}\`)`,
    {
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "text/javascript",
      },
      status: code,
    },
  );
}

export async function npmHandler(
  url: URL,
): Promise<Response> {
  // Basic setup
  const start = performance.now();
  const host = `${url.protocol}//${url.host}/npm`;
  const query = new URLSearchParams(url.search);
  const paths = url.pathname.split("/");
  paths.shift();

  if (!paths[1]) {
    return error(`Please insert a NPM package name.`, 400);
  }

  let name = "";
  let version = "";

  if (paths[1].startsWith("@")) {
    name = paths[1] + "/" + paths[2].split("@")[0];
    version = paths[2].split("@")[1] || "latest";
    paths.shift();
  } else {
    name = paths[1].split("@")[0];
    version = paths[1].split("@")[1] || "latest";
  }

  paths.shift();
  paths.shift();

  const submodule = paths.join("/");

  const registry = query.get("registry") || "https://registry.npmjs.org";

  let req = await fetch(`${registry}/${name}/${version}`);
  let data = await req.json();

  if (!data || req.status == 404) {
    return error(
      `Cannot find '${name}'`,
      404,
    );
  }

  if (req.status == 405 && !semver.valid(version)) {
    req = await fetch(`${registry}/${name}`);
    data = await req.json();

    if (data.error) {
      return error(
        `Cannot find '${name}@${version}'`,
        404,
      );
    }

    if (!data["dist-tags"][version]) {
      return error(`Cannot find version '${version}' for '${name}'`, 404);
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
      let prefix = "";
      for await (const entry of untar) {
        if (entry.fileName.split("/")[0] && !prefix) {
          prefix = entry.fileName.split("/")[0] + "/";
        }
        if (entry.fileName == prefix + dest) {
          text = new TextDecoder().decode(await readAll(entry));
        }
      }
      if (text == "") {
        return error(`Cannot find file '${name}@${data.version}/${dest}'`, 404);
      }
      try {
        let minify = query.get("minify") === "true" ? true : false || true;
        let bundle = query.get("bundle") === "true" ? true : false || true;
        let content = text;
        if (
          dest.endsWith(
            ".js" || ".jsx" || ".mjs" || ".cjs" || ".ts" || ".tsx" || ".mts" ||
              ".cts",
          )
        ) {
          let result = await esbuild.build({
            stdin: {
              contents: text,
            },
            format: "esm",
            target: query.get("target") || "esnext",
            minify,
            bundle,
            platform: "browser",
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
                    async (args) => {
                      let p = `${host}/${name}@###/${
                        path.join(dest, "..", args.path).replace("\\", "/")
                      }`;
                      const exts = [
                        ".js",
                        ".jsx",
                        ".mjs",
                        ".cjs",
                        ".ts",
                        ".tsx",
                        ".mts",
                        ".cts",
                      ];
                      const ext = p.split(".")[p.split(".").length];
                      if (!ext) {
                        for await (let e of exts) {
                          const res = await fetch(p + e);
                          if (res.status === 200) {
                            p += e;
                            p = p.replace("###", version);
                            return {
                              path: p,
                              external: true,
                            };
                          }
                        }
                        throw new Error(`Cannot resolve '${p}'`);
                      }
                      p = p.replace("###", version);
                      return {
                        path: p,
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
            status: 200,
          },
        );
      } catch (e) {
        console.error(e.stack);
        return error(`Compile error: ${e.stack}`, 406);
      }
    }
  } else {
    dest = "index.js";
    if (data.main) dest = data.main.replace("./", "");
    if (data.module) dest = data.module.replace("./", "");

    let types = "index.d.ts";
    if (data.types) types = data.types.replace("./", "");
    if (data.typings) types = data.typings.replace("./", "");

    if (name.startsWith("@types")) dest = types;

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
          "x-typescript-types":
            `${host}/@types/${name}@${data.version}/${types}`,
        },
        status: 200,
      },
    );
  }
}
