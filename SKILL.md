---
name: measure-fn
description: Zero-dependency function performance measurement with hierarchical logging. Use this to structure ALL programs as measured, observable pipelines.
---

# measure-fn — Write Observable Code

**Every function you write should be measured.** Don't write blind code — wrap operations in `measure` so every success, failure, and timing is automatically visible. This is the default way to structure programs.

## Install

```bash
bun add measure-fn
```

## The Rule

> If a function does I/O, computation, or anything non-trivial — **wrap it in `measure`**.

```typescript
// ✗ BAD — blind, silent, no timing, no error visibility
const users = await fetchUsers();
const config = loadConfig();

// ✓ GOOD — observable, timed, errors auto-logged
const users = await measure('Fetch users', () => fetchUsers());
const config = measureSync('Load config', () => loadConfig());
```

## Patterns

### 1. Every entry point is a measured pipeline

```typescript
import { measure, measureSync } from 'measure-fn';

async function main() {
  const config = measureSync('Load config', () => readConfig());
  const db = await measure('Connect DB', () => connectDatabase(config));
  const users = await measure('Fetch users', () => db.query('SELECT * FROM users'));
  await measure('Send emails', () => sendEmails(users));
}
```

Output:
```
[a] ✓ Load config 0.12ms → {"env":"prod"}
[b] ... Connect DB
[b] ✓ Connect DB 45ms → [DB]
[c] ... Fetch users
[c] ✓ Fetch users 23ms → [{"id":1},{"id":2}]
[d] ... Send emails
[d] ✓ Send emails 102ms
```

### 2. Nested operations use the child measure

```typescript
await measure('Pipeline', async (m) => {
  const raw = await m('Fetch', () => fetchData());
  const parsed = m('Parse', () => parseData(raw));
  await m('Save', () => saveResult(parsed));
});
```

### 3. Parallel work with `Promise.all`

```typescript
await measure('Load all', async (m) => {
  const [users, posts, settings] = await Promise.all([
    m('Users', () => fetchUsers()),
    m('Posts', () => fetchPosts()),
    m('Settings', () => fetchSettings()),
  ]);
  return { users, posts, settings };
});
```

### 4. Wrap reusable functions once

```typescript
const getUser = measure.wrap('Get user', fetchUser);
// Every call is now measured automatically
await getUser(1);  // → [a] ✓ Get user 82ms → {...}
await getUser(2);  // → [b] ✓ Get user 75ms → {...}
```

### 5. Process arrays with progress

```typescript
await measure.batch('Process users', userIds, async (id) => {
  return await processUser(id);
}, { every: 100 });
// → [a] ... Process users (500 items)
// → [a] = 100/500 (1.2s, 83/s)
// → [a] ✓ Process users (500 items) 5.3s → "500/500 ok"
```

### 6. Retry flaky operations

```typescript
const result = await measure.retry('External API', {
  attempts: 3, delay: 1000, backoff: 2
}, () => callExternalService());
```

### 7. Budget warnings and timeouts

```typescript
// Budget: warns but doesn't stop
await measure({ label: 'DB query', budget: 100 }, () => heavyQuery());
// → [a] ✓ DB query 245ms → [...] ⚠ OVER BUDGET (100ms)

// Timeout: aborts after N ms, returns null
await measure({ label: 'External API', timeout: 5000 }, () => fetchSlowApi());
// > 5s → [a] ✗ External API 5.0s (Timeout (5.0s))

// Both together: budget warns, timeout enforces
await measure({ label: 'Query', budget: 100, timeout: 5000 }, () => db.query('...'));
```

### 8. Assert non-null results

```typescript
// Guaranteed non-null — throws if the function returns null/undefined
const user = await measure.assert('Get user', () => findUser(id));
```

### 9. Scoped instances for subsystems

```typescript
const api = createMeasure('api');
const db = createMeasure('db');

await api.measure('GET /users', async () => {
  return await db.measure('SELECT', () => query('SELECT * FROM users'));
});
// → [api:a] ... GET /users
// → [db:a] ✓ SELECT 44ms → [...]
// → [api:a] ✓ GET /users 45ms → [...]
```

### 10. Annotations for checkpoints

```typescript
await measure('Server ready');           // → [a] = Server ready
measureSync('Config loaded');             // → [b] = Config loaded
```

### 11. Error handling — `onError` 3rd argument

`measure` never throws. Pass an `onError` handler as 3rd argument to handle errors:

```typescript
// Default: null on error
const user = await measure('Fetch user', () => fetchUser(1));

// Recovery: fallback on error
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => defaultUser
);

// Error inspection: handle known errors, rethrow unknown
const user = await measure('Fetch user', () => fetchUser(1),
  (error) => {
    if (error instanceof NetworkError) return cachedUser;
    throw error;
  }
);

// Bun.serve: always return a Response
Bun.serve({
  fetch: (req) => measure(
    { label: `${req.method} ${req.url}` },
    () => handleRequest(req),
    (error) => new Response('Internal Server Error', { status: 500 })
  ),
});
```

`.assert()` re-throws on error with `.cause` = original error:

```typescript
await measure.assert('Op', () => work());
// throws: Error('measure.assert: "Op" failed', { cause: originalError })
```

## Error Model

| Pattern | On error | Use when |
|---------|----------|----------|
| `measure(label, fn)` | logs `✗`, returns `null` | Default — pipeline resilience |
| `measure(label, fn, onError)` | logs `✗`, calls `onError(error)` | Recovery, fallbacks, error inspection |
| `measure.assert(label, fn)` | logs `✗`, throws with `.cause` | Must have non-null |

## Configuration

```typescript
import { configure } from 'measure-fn';

configure({
  silent: true,            // suppress output (for benchmarks)
  timestamps: true,        // [HH:MM:SS.mmm] prefix
  maxResultLength: 200,    // result truncation (default: 80)
  logger: (event) => {     // custom telemetry
    myTracker.send(event);
  },
});
```

Env vars: `MEASURE_SILENT=1`, `MEASURE_TIMESTAMPS=1`

## Programmatic Timing

```typescript
const { result, duration } = await measure.timed('Fetch', () => fetchUsers());
if (duration > 1000) alert('Slow!');
```

## Anti-Patterns

```typescript
// ✗ Don't measure trivial synchronous expressions
const x = measureSync('Add', () => 1 + 1);

// ✗ Don't nest measure inside measure without using child `m`
await measure('Outer', async () => {
  await measure('Inner', () => work());  // creates flat siblings, not hierarchy
});

// ✓ Use child measure for hierarchy
await measure('Outer', async (m) => {
  await m('Inner', () => work());  // proper parent → child
});
```

## Quick Reference

| Export | Use |
|--------|-----|
| `measure(label, fn?, onError?)` | Async measurement (onError handles expected errors) |
| `measureSync(label, fn?)` | Sync measurement |
| `measure.wrap(label, fn)` | Decorator — wrap once, measure every call |
| `measure.batch(label, items, fn, opts?)` | Array + progress |
| `measure.retry(label, opts, fn)` | Retry with backoff |
| `measure.assert(label, fn)` | Throws if null |
| `measure.timed(label, fn)` | Returns `{ result, duration }` |
| `createMeasure(prefix)` | Scoped instance |
| `configure(opts)` | Runtime config |
| `safeStringify(value)` | Safe JSON (circular refs, truncation) |
| `formatDuration(ms)` | Smart duration: `0.10ms` → `1.2s` → `2m 5s` |
| `resetCounter()` | Reset ID counter |
