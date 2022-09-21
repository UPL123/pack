# Pack BETA

Pack is a fast [Deno](https://deno.land/) powered Content Delivery Network for [NPM](https://npmjs.com) and Deno

## Example

Import `path-to-regexp` from NPM

```js
import { pathToRegexp } from "https://pack.deno.dev/npm/path-to-regexp";

console.log(pathToRegexp("/asd/asd"));
// /^\/asd\/asd[\/#\?]?$/i
```

Import `canvas-confetti` from NPM

```js
import confetti from "https://pack.deno.dev/npm/canvas-confetti";

var myConfetti = confetti.create(canvas, {
  resize: true,
  useWorker: true,
});
myConfetti({
  particleCount: 100,
  spread: 160,
});
// Creates a confetti explosion on canvas 🎉
```

Import `datetime` from Deno

```js
import * as mod from "https://pack.deno.dev/deno/std/datetime/mod.ts";

console.log(Object.keys(mod));
// DAY, HOUR, MINUTE, SECOND, WEEK, dayOfYear, difference, format, isLeap, parse, toIMF, weekOfYear
```

## On beta

This project may contain errors, bugs, etc. In that case, please report them in the [issue page](https://github.com/UPL123/pack/issues)
