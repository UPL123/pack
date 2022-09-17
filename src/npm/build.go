package main

import (
	"os"

	"github.com/evanw/esbuild/pkg/api"
)

func targetByString(str string) api.Target {
	switch str {
	case "es2022":
		return api.ES2022
	case "es2021":
		return api.ES2021
	case "es2020":
		return api.ES2020
	case "es2019":
		return api.ES2019
	case "es2018":
		return api.ES2018
	case "es2017":
		return api.ES2017
	case "es2016":
		return api.ES2016
	case "es2015":
		return api.ES2015
	case "esnext":
		return api.ESNext
	case "es5":
		return api.ES5
	}

	return api.DefaultTarget
}

var packResolver = api.Plugin{
	Name: "pack-resolver",
	Setup: func(build api.PluginBuild) {
		build.OnResolve(api.OnResolveOptions{Filter: `^@?(([a-z0-9]+-?)+\/?)+$`},
			func(args api.OnResolveArgs) (api.OnResolveResult, error) {
				return api.OnResolveResult{
					Path:     os.Args[6] + "/" + args.Path,
					External: true,
				}, nil
			},
		)
	},
}

func main() {
	entry := os.Args[1]
	target := targetByString(os.Args[2])
	var minify bool
	if os.Args[3] == "true" {
		minify = true
	} else {
		minify = false
	}
	var bundle bool
	if os.Args[4] == "true" {
		bundle = true
	} else {
		bundle = false
	}
	out := os.Args[5]

	api.Build(api.BuildOptions{
		EntryPoints:       []string{entry},
		Target:            target,
		MinifyWhitespace:  minify,
		MinifySyntax:      minify,
		MinifyIdentifiers: minify,
		Bundle:            bundle,
		Outfile:           out,
		Plugins:           []api.Plugin{packResolver},
		Write:             true,
	})
}
