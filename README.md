# measure-fn

Zero-dependency function instrumentation. Wrap any function — get timing, hierarchy, errors, and results printed automatically.

```
[a] ✓ Load config 0.09ms → {"env":"prod","port":3000}
[b] = App ready
[c] ... Pipeline
[c-a] ... Fetch User (userId=1)
[c-b] ... Fetch User (userId=2)
[c-b] ✓ Fetch User 55ms → {"id":2,"name":"User 2"}
[c-a] ✓ Fetch User 86ms → {"id":1,"name":"User 1"}
[c] ✓ Pipeline 86ms
[d] ✓ DB query 91ms → {"rows":42} ⚠ OVER BUDGET (30ms)
[e] ✗ Flaky API 2ms (Connection refused)
```

No setup. No dashboards. Just wrap your functions.

```sh
bun add measure-fn
```

---

## Philosophy

**Your app should never crash because you forgot a try-catch.**

`measure` wraps your function in a try-catch automatically. If it throws, measure logs the error with `✗`, timing, and full stack trace — then returns `null` instead of crashing your process. The error is always visible. Your pipeline keeps running.

```typescript
// Without measure — one forgotten try-catch crashes everything
const user = await fetchUser(1);  // throws → 💥 unhandled error

// With measure — errors are caught, logged, and returned as null
const user = await measure('Fetch user', () => fetchUser(1));  // throws → logs ✗, returns null
```

**When you expect specific errors**, pass an `onError` handler as the 3rd argument. It receives the caught error — return a fallback, or rethrow if you want it to propagate:

```typescript
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => {
    if (error instanceof NotFoundError) return guestUser;
    throw error;  // unexpected — let it propagate
  }
);
```

This separates two concerns cleanly:
- **Unexpected errors** — measure catches them, logs `✗`, returns `null`. Your app stays alive.
- **Expected errors** — you handle them in `onError` with full context.

---

## Quick Start

```typescript
import { measure, measureSync } from 'measure-fn';

// Async
const data = await measure('Fetch data', () => fetch(url).then(r => r.json()));
// → [a] ... Fetch data
// → [a] ✓ Fetch data 245ms → [{"id":1}]

// Sync — single line, no "..." prefix for leaf operations
const config = measureSync('Parse config', () => JSON.parse(str));
// → [b] ✓ Parse config 0.20ms → {"port":3000}
```

---

## Error Handling

### Default: null on error

```typescript
const user = await measure('Fetch user', () => fetchUser(1));
// success → User
// error   → logs ✗, returns null
```

### onError: handle expected errors

```typescript
// Fallback value
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => defaultUser
);

// Conditional recovery
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => {
    if (error instanceof NetworkError) return cachedUser;
    throw error;  // unexpected — propagates up
  }
);
```

### .assert(): must succeed

```typescript
const user = await measure.assert('Get user', () => fetchUser(1));
// success → User (guaranteed non-null)
// error   → logs ✗, then throws with .cause = original error
```

### Bun.serve

The fetch handler must return a `Response` — not `null`. Use `onError` to guarantee it:

```typescript
Bun.serve({
  fetch: (req) => measure(
    { label: `${req.method} ${req.url}` },
    () => handleRequest(req),
    (error) => new Response('Internal Server Error', { status: 500 })
  ),
});
```

### Summary

| Pattern | On error | Use when |
|---------|----------|----------|
| `measure(label, fn)` | logs `✗`, returns `null` | Default — app stays alive |
| `measure(label, fn, onError)` | logs `✗`, calls `onError(error)` | Expected errors — recovery, fallbacks |
| `measure.assert(label, fn)` | logs `✗`, throws with `.cause` | Must have non-null result |

---

## API

### `measure(label, fn?, onError?)` — async

```typescript
// Simple
const user = await measure('Fetch user', () => fetchUser(1));

// With metadata (label object)
const user = await measure({ label: 'Fetch user', userId: 1 }, () => fetchUser(1));

// Nested hierarchy — use child `m`
await measure('Pipeline', async (m) => {
  const user = await m('Fetch user', () => fetchUser(1));
  const posts = await m('Fetch posts', () => fetchPosts(user.id));
  return posts;
});
// → [a] ... Pipeline
// → [a-a] ✓ Fetch user 82ms → {"id":1}
// → [a-b] ✓ Fetch posts 45ms → [...]
// → [a] ✓ Pipeline 128ms

// Parallel
await measure('Parallel', async (m) => {
  await Promise.all([
    m({ label: 'Fetch', userId: 1 }, () => fetchUser(1)),
    m({ label: 'Fetch', userId: 2 }, () => fetchUser(2)),
  ]);
});

// Annotation (no function — just a marker)
await measure('checkpoint');
// → [a] = checkpoint
```

### `measureSync(label, fn?)` — synchronous

```typescript
// Leaf — single line output
const hash = measureSync('Hash', () => computeHash(data));

// With children — start + end
measureSync('Report', (m) => {
  const data = m('Parse', () => parse(raw));
  return m('Summarize', () => summarize(data));
});
```

### `measure.wrap(label, fn)` — decorator

```typescript
const getUser = measure.wrap('Get user', fetchUser);
await getUser(1);  // → [a] ✓ Get user 82ms → {...}
await getUser(2);  // → [b] ✓ Get user 75ms → {...}
```

### `measure.batch(label, items, fn, opts?)` — array processing

```typescript
const results = await measure.batch('Process', userIds, async (id) => {
  return await processUser(id);
}, { every: 100 });
// → [a] ... Process (500 items)
// → [a] = 100/500 (1.2s, 83/s)
// → [a] ✓ Process (500 items) 5.3s → "500/500 ok"
```

### `measure.retry(label, opts, fn)` — retry with backoff

```typescript
const result = await measure.retry('Flaky API', {
  attempts: 3, delay: 1000, backoff: 2
}, () => fetchFlakyApi());
// → [a] ✗ Flaky API [1/3] 102ms (timeout)
// → [b] ✓ Flaky API [2/3] 89ms → {"status":"ok"}
```

### Budget — warn on slow operations

```typescript
await measure({ label: 'DB query', budget: 100 }, () => db.query('SELECT ...'));
// → [a] ✓ DB query 245ms → [...] ⚠ OVER BUDGET (100ms)
```

### `measure.timed(label, fn?)` — programmatic timing

```typescript
const { result, duration } = await measure.timed('Fetch', () => fetchUsers());
if (duration > 1000) alert('Slow!');
```

### `createMeasure(prefix)` — scoped instances

```typescript
const api = createMeasure('api');
const db = createMeasure('db');

await api.measure('GET /users', async () => {
  return await db.measure('SELECT', () => query('...'));
});
// → [api:a] ... GET /users
// → [db:a] ✓ SELECT 44ms → [...]
// → [api:a] ✓ GET /users 45ms → [...]
```

### `configure(opts)` — runtime config

```typescript
configure({
  silent: true,            // suppress all output
  timestamps: true,        // prepend [HH:MM:SS.mmm]
  maxResultLength: 200,    // truncate results (default: 80)
  logger: (event) => {     // custom event handler
    myTelemetry.track(event);
  }
});
```

Env vars: `MEASURE_SILENT=1`, `MEASURE_TIMESTAMPS=1`

---

## Output Format

| Pattern | Meaning | Example |
|---------|---------|---------|
| `[id] ... label` | Async start | `[a] ... Pipeline` |
| `[id] ✓ label Nms → value` | Success | `[a] ✓ Fetch 102ms → {"id":1}` |
| `[id] ✗ label Nms (err)` | Error | `[a] ✗ Fetch 2ms (timeout)` |
| `[id] = label` | Annotation | `[a] = checkpoint` |

IDs encode hierarchy: `[a]` → root, `[a-a]` → first child, `[a-b]` → second child. No indentation, no colors — works in any terminal, log aggregator, or CI.

---

## Utilities

```typescript
import { safeStringify, formatDuration, resetCounter } from 'measure-fn';

safeStringify({ circular: self });  // handles circular refs, truncates
formatDuration(91234);               // "1m 31s"
resetCounter();                      // reset ID counter (useful for tests)
```

## Zero Dependencies

Works in Bun, Node, and Deno. Uses only `performance.now()` and `console`.

## License

MIT
