// Imports
import {
  copy,
  emptyDirSync,
  ensureDir,
  ensureFile,
  esbuild,
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
      dest = data.exports["./" + submodule].import.replace("./", "");
      // If is normal package
      return new Response(
        `/* Pack - Servered '${name}@${data.version}/${submodule}' on ${
          Math.floor(end - start)
        }ms */
export * from '${host}/${name}@${data.version}/${dest}';`,
        {
          headers: {
            "content-type": "text/javascript",
          },
        },
      );
    } catch (e) {
      // Is a file
      const tarball = data.dist.tarball;
      const res = await fetch(tarball);
      const stream = res.body?.pipeThrough(new DecompressionStream("gzip"))
        .getReader();
      const untar = new Untar(readerFromStreamReader(stream!));
      const random = Math.floor(performance.now());
      for await (const entry of untar) {
        if (entry.type === "directory") {
          console.log(entry.fileName);
          if (entry.fileName == "package") {
            await ensureDir("tmp/" + entry.fileName + "-" + random);
          } else {
            await ensureDir("tmp/" + entry.fileName);
          }
          continue;
        }
        await ensureFile("tmp/" + entry.fileName);
        const file = await Deno.open("tmp/" + entry.fileName, { write: true });
        await copy(entry, file);
      }
      let dest = "";
      if (!data.exports) {
        dest = data.module || data.main;
      } else {
        if (data.exports["./" + submodule]) {
          dest = data.exports["./" + submodule].import.replace("./", "");
        } else {
          dest = data.exports["."].import.replace("./", "");
        }
      }
      try {
        let minify = query.get("minify") || true;
        let bundle = query.get("bundle") || false;
        const p = Deno.run({
          cmd: [
            "go",
            "run",
            "src/npm/build.go",
            `tmp/package/${dest}`,
            query.get("target") || "es2022",
            `${minify}`,
            `${bundle}`,
            "tmp/file.js",
            host,
          ],
        });
        await p.status();
        const end = performance.now();
        const content = new TextDecoder().decode(
          Deno.readFileSync("tmp/file.js"),
        );
        emptyDirSync("./tmp");
        return new Response(
          `/* Pack - Compiled in ${Math.floor(end - start)}ms*/
${content}`,
          {
            headers: {
              "content-type": "text/javascript",
            },
          },
        );
      } catch (e) {
        console.error(e.stack);
        return error(`Compile error: ${e.stack}`);
      }
    }
  }

  dest = data.module.replace("./", "") || data.main.replace("./", "");

  // If is normal package
  return new Response(
    `/* Pack - Servered '${name}@${data.version}' on ${
      Math.floor(end - start)
    }ms */
export * from '${host}/${name}@${data.version}/${dest}';`,
    {
      headers: {
        "content-type": "text/javascript",
      },
    },
  );
}
