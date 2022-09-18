---
name: Failed import
about: Report an error on import
title: "[FAILED IMPORT]"
labels: bug
assignees: UPL123

---

**Import stack**
```js
import { myFunc } from "https://pack.deno.dev/package@1.2.3";
```

**Error Message**
```js
/* Pack - error */
throw new Error(`[Pack] Failed to import 'https://pack.deno.dev/package@1.2.3'`);
```
