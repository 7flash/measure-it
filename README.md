<p align="center">
  <img src="banner.png" alt="measure-fn" width="100%" />
</p>

<p align="center">
  <b>Replace try-catch + timing boilerplate in TypeScript with a single line of code.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/measure-fn"><img src="https://img.shields.io/npm/v/measure-fn.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/measure-fn"><img src="https://img.shields.io/npm/dm/measure-fn.svg" alt="npm downloads"></a>
  <a href="https://github.com/7flash/measure-fn/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
</p>

Whenever a function needs error handling so it doesn't crash, and timing so you know how long it took, you usually end up adding this boilerplate manually:

**Before:**

```typescript
let users = null;
try {
  const start = performance.now();
  users = await fetchUsers();
  const ms = (performance.now() - start).toFixed(2);
  console.log(`[a] ··········· ${ms}ms → ${JSON.stringify(users)}`);
} catch (e) {
  console.log(`[a] ✗ Fetch users (${e.message})`);
  console.error(e.stack);
}
```

**After:** measure-fn does the exact same thing in one line. Completely type-safe (infers `T | null`) and never crashes.

```typescript
import { measure } from 'measure-fn';

const users = await measure('Fetch users', () => fetchUsers());
// → [a] ··········· 86ms → [{"id":1},{"id":2}]
```

## Installation

```sh
npm install measure-fn
# or bun add / pnpm add / yarn add
```

## ✨ Defaults

Every `measure` call automatically:

- 🛡️ **Catches errors** → logs `✗` with a stack trace and returns `null` (no unhandled rejections)
- ⏱️ **Logs timing** → prints `label Nms → result` using `performance.now()`
- 🌳 **Assigns a trace ID** → `[a]`, `[b]`, `[a-a]` for zero-config nested hierarchy

## 🌳 Nested Calls (Tracing)

Pass a child `m` function to get hierarchical APM-like tracing for free:

```typescript
await measure('Pipeline', async (m) => {
  const user = await m('Fetch user', () => fetchUser(1));
  const posts = await m('Fetch posts', () => fetchPosts(user.id));
  return posts;
});
```

```
[a] ... Pipeline
[a-a] ·········· 82ms → {"id":1}
[a-b] ··········· 45ms → [...]
[a] ········ 128ms
```

Parallel execution works cleanly too:

```typescript
await measure('Load all', async (m) => {
  const [users, posts] = await Promise.all([
    m('Users', () => fetchUsers()),
    m('Posts', () => fetchPosts()),
  ]);
});
```

## 🛡️ Error Handling

By default, errors return `null` so your pipelines can continue safely:

```typescript
const user = await measure('Fetch user', () => fetchUser(1));
// If it throws → logs ✗, user = null
```

**Custom Fallbacks:** Pass `onError` as the 3rd argument:

```typescript
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => defaultUser
);
// If it throws → logs ✗, user = defaultUser
```

If the `onError` fallback itself throws, that's also safely caught and returns `null`. measure never crashes.

**Fail-Fast (`.assert`):** Use `.assert()` when you need a guaranteed non-null result:

```typescript
const user = await measure.assert('Get user', () => fetchUser(1));
// If it throws → logs ✗, re-throws with .cause = original error
```

| Pattern | On error | Return Type |
|---------|----------|-------------|
| `measure(label, fn)` | returns `null` | `T \| null` |
| `measure(label, fn, onError)` | returns `onError(error)` | `T` |
| `measure.assert(label, fn)` | throws with `.cause` | `T` |

## 🚦 Timeouts & Budgets

The first argument can be a label string, or an options object:

| Field | Type | Effect |
|-------|------|--------|
| `label` | `string` | Display name (required if object) |
| `timeout` | `number` | Aborts after N ms (returns `null`) |
| `budget` | `number` | Warns if slower than N ms (doesn't abort) |
| `maxResultLength` | `number` | Override result truncation (0 = unlimited, inherits to children) |
| any other | `any` | Logged inline as context metadata |

**Timeout** (enforce):

```typescript
const data = await measure({ label: 'Slow API', timeout: 5000 }, () => fetchSlowApi());
// > 5s → ✗ Slow API 5.0s (Timeout (5.0s)), returns null
```

Works with `onError` fallback too.

**Budget** (warn):

```typescript
await measure({ label: 'DB query', budget: 100 }, () => db.query('...'));
// → [a] ········ 245ms → [...] ⚠ OVER BUDGET (100ms)
```

Combine both — budget warns early, timeout enforces a hard stop:

```typescript
await measure({ label: 'Query', budget: 100, timeout: 5000 }, () => query());
```

**Metadata context:**

```typescript
await measure({ label: 'Fetch user', userId: 1 }, () => fetchUser(1));
// → [a] ... Fetch user (userId=1)
```

## 🧰 Extensions

### `measure.wrap(label, fn)`

Wrap a function once, measure every time it's called:

```typescript
const getUser = measure.wrap('Get user', fetchUser);
await getUser(1);  // → [a] ········ 82ms
await getUser(2);  // → [b] ········ 75ms
```

### `measure.batch(label, items, fn, opts?)`

Process arrays with built-in progress logs:

```typescript
const results = await measure.batch('Process', userIds, async (id) => {
  return await processUser(id);
}, { every: 100 });
// → [a] ... Process (500 items)
// → [a] = 100/500 (1.2s, 83/s)
// → [a] ················· 5.3s → "500/500 ok"
```

### `measure.retry(label, opts, fn)`

Automatic retries with delay and backoff:

```typescript
const result = await measure.retry('Flaky API', {
  attempts: 3, delay: 1000, backoff: 2
}, () => fetchFlakyApi());
// → [a] ✗ Flaky API [1/3] 102ms (timeout)
// → [b] ················· 89ms → {"status":"ok"}
```

### `measure.timed(label, fn?)`

Get duration programmatically alongside the result:

```typescript
const { result, duration } = await measure.timed('Fetch', () => fetchUsers());
```

### `createMeasure(prefix)`

Scoped instances with custom prefixes:

```typescript
const api = createMeasure('api');
const db = createMeasure('db');

await api.measure('GET /users', async () => {
  return await db.measure('SELECT', () => query('...'));
});
// → [api:a] ... GET /users
// → [db:a] ······ 44ms
// → [api:a] ·········· 45ms
```

### Annotations & Sync

```typescript
import { measureSync } from 'measure-fn';

const config = measureSync('Parse config', () => JSON.parse(raw));

await measure('Server ready');
// → [a] = Server ready
```

## ⚙️ Configuration

```typescript
import { configure } from 'measure-fn';

configure({
  silent: true,            // suppress all output
  timestamps: true,        // prepend [HH:MM:SS.mmm]
  maxResultLength: 200,    // truncate results (default: 0 = unlimited)
  dotEndLabel: false,      // show full label on end lines (default: true = dots)
  dotChar: '.',            // character for dot fill (default: '·')
  logger: (event) => {     // custom event handler
    myTelemetry.track(event);
  }
});
```

Env vars: `MEASURE_SILENT=1`, `MEASURE_TIMESTAMPS=1`

## Output Format

| Symbol | Meaning | Example |
|--------|---------|---------|
| `...` | Started | `[a] ... Fetch users` |
| `···` | Success | `[a] ··········· 86ms → [...]` |
| `✗` | Error | `[a] ✗ ··········· (Network Error)` |
| `=` | Annotation | `[a] = Server ready` |

IDs encode hierarchy: `[a]` → root, `[a-a]` → first child, `[a-b]` → second child.

## License

MIT
