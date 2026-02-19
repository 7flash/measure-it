# measure-fn

**Stop writing blind code.** Every function you write either succeeds or fails, takes some amount of time, and lives inside a larger flow. `measure-fn` makes all of that visible — automatically, hierarchically, beautifully.

```
> [a] Build Dashboard
> [a-a] Fetch users
< [a-a] ✓ 245.12ms
> [a-b] Process users
> [a-b-a] Enrich user (userId=1)
< [a-b-a] ✓ 12.34ms
> [a-b-b] Enrich user (userId=2)
< [a-b-b] ✓ 11.89ms
< [a-b] ✓ 25.67ms
> [a-c] Generate report
< [a-c] ✓ 8.91ms
< [a] ✓ 281.23ms
```

No setup. No dashboards to configure. No telemetry SDKs. Just wrap your functions and your entire program becomes observable.

## Why Structure Your Programs With measure-fn

Most codebases are **opaque by default**. When something is slow, you add `console.time`. When something crashes, you add `try/catch`. When you need tracing, you integrate a monitoring SDK. You bolt observability on *after* the problems arrive.

**measure-fn inverts this.** You structure your program with `measure` from the start, and you get:

- ⏱️ **Every operation timed** — no more "which step is slow?"
- 🌳 **Hierarchical trace** — see exactly how operations nest and compose
- 🛡️ **Errors caught and logged automatically** — with stack traces, causes, and unique IDs for every operation
- 📍 **Unique alphabetic IDs** — `[a-b-c]` tells you exactly which step in which pipeline failed
- 🔄 **Zero disruption** — errors return `null`, they never crash your program. Handle failures, don't fight them.

The result: your logs tell a **complete story**. You can read them top-to-bottom and understand exactly what happened, what took how long, and what failed — without adding a single breakpoint.

### The Philosophy: Programs as Measured Pipelines

Think of your program not as a flat list of statements, but as a **tree of measured operations**. Every meaningful unit of work — an API call, a database query, a transformation, a batch process — becomes a node in this tree.

```typescript
// ❌ Typical blind code
async function processOrder(orderId: string) {
  const order = await fetchOrder(orderId);
  const inventory = await checkInventory(order.items);
  await chargePayment(order);
  await shipOrder(order);
}

// ✅ Measured code — observable from day one
async function processOrder(orderId: string) {
  await measure({ label: 'Process Order', orderId }, async (m) => {
    const order = await m('Fetch order', () => fetchOrder(orderId));
    if (!order) return; // error already logged + traced

    await m('Check inventory', () => checkInventory(order.items));
    await m('Charge payment', () => chargePayment(order));
    await m('Ship order', () => shipOrder(order));
  });
}
```

The measured version costs you **one extra line per operation**. In return, you get timing, error isolation, hierarchical tracing, and structured logs — forever.

## Install

```sh
bun add measure-fn
# or
npm install measure-fn
```

## Quick Start

```typescript
import { measure, measureSync } from 'measure-fn';

// Label first, function second — reads like a sentence
await measure('Fetch data', async () => {
  const res = await fetch('https://api.example.com/data');
  return res.json();
});

// Sync operations work the same way
const config = measureSync('Parse config', () => {
  return JSON.parse(configString);
});
```

## API

### `measure(label, fn?)` — async

```typescript
// Simple: wrap any async operation
const user = await measure('Fetch user', async () => {
  return await fetchUser(1);
});

// Nested: receive `m` for composing sub-operations into a tree
await measure('Pipeline', async (m) => {
  const user = await m('Get user', () => fetchUser(1));
  const posts = await m('Get posts', () => fetchPosts(user.id));

  // Arbitrarily deep nesting
  await m('Enrich posts', async (m2) => {
    for (const post of posts) {
      await m2({ label: 'Get comments', postId: post.id }, () =>
        fetchComments(post.id)
      );
    }
  });
});

// Annotation — log a marker without timing anything
await measure('checkpoint reached');
```

### `measureSync(label, fn?)` — synchronous

```typescript
const result = measureSync('Compute hash', () => {
  return computeExpensiveHash(data);
});

// Nested sync operations
measureSync('Build report', (m) => {
  const data = m('Parse CSV', () => parseCSV(raw));
  const summary = m('Summarize', () => summarize(data));
  return summary;
});
```

### Label formats

Labels can be a string or an object with a `.label` property. Extra properties are logged as metadata — perfect for recording request IDs, user IDs, or any context:

```typescript
await measure('Simple string label', async () => fetchUser(1));

await measure({ label: 'Fetch user', userId: 1, region: 'us-east' }, async () => fetchUser(1));
// Logs: > [a] Fetch user (userId=1 region="us-east")
```

### `resetCounter()`

Resets the global alphabetic ID counter. Essential for deterministic test output:

```typescript
import { resetCounter } from 'measure-fn';
beforeEach(() => resetCounter());
```

## Error Handling — Errors Are Data, Not Crashes

This is the most important design decision in `measure-fn`: **errors never propagate**. When a measured function throws:

1. The error is logged with `✗`, the duration, and the error message
2. The full stack trace and `cause` (if present) go to `console.error` with the operation's unique ID
3. The function returns `null`

```typescript
const result = await measure('Risky operation', async () => {
  throw new Error('Network timeout', { cause: { url: '/api', retries: 3 } });
});

// result === null — no crash, no try/catch needed
```

```
> [a] Risky operation
< [a] ✗ 2.31ms (Network timeout)
[a] Error: Network timeout
    at ... (stack trace)
[a] Cause: { url: "/api", retries: 3 }
```

This makes your programs **resilient by default**. A failing sub-operation doesn't take down the parent — it returns `null` and you decide what to do:

```typescript
await measure('User Pipeline', async (m) => {
  const user = await m('Get user', () => fetchUser(999));
  if (user === null) {
    // The error was already logged with full context.
    // Skip dependent operations gracefully.
    return;
  }
  await m('Get posts', () => fetchPosts(user.id));
});
```

No try/catch pyramids. No error-swallowing. Every error is captured, attributed to a specific operation ID, and visible in plain text.

## Output Format

| Prefix | Meaning |
|--------|---------|
| `>` | Operation started |
| `<` | Operation completed |
| `=` | Annotation (label-only, no timing) |
| `✓` | Success |
| `✗` | Error |

IDs are alphabetic and hierarchical: `[a]`, `[a-a]`, `[a-b]`, `[a-b-a]`, etc. After `z` it wraps: `aa`, `ab`, `ac`...

Every ID is a **unique address** for that operation in that execution. You can grep for `[a-c-b]` and find exactly one operation — making log analysis trivial.

## Real-World Patterns

### Server Request Handler

```typescript
app.get('/api/dashboard', async (req, res) => {
  const data = await measure({ label: 'GET /api/dashboard', ip: req.ip }, async (m) => {
    const session = await m('Validate session', () => validateSession(req));
    if (!session) return null;

    const [users, stats] = await Promise.all([
      m('Fetch users', () => db.users.all()),
      m('Compute stats', () => computeStats()),
    ]);

    return { users, stats };
  });

  res.json(data ?? { error: 'Failed' });
});
```

### Background Job

```typescript
async function processBatch(batchId: string) {
  await measure({ label: 'Process Batch', batchId }, async (m) => {
    const items = await m('Load items', () => loadBatch(batchId));
    if (!items) return;

    await m('Transform', async (m2) => {
      for (const item of items) {
        await m2({ label: 'Process item', itemId: item.id }, () => 
          transform(item)
        );
      }
    });

    await m('Save results', () => saveBatch(batchId, items));
  });
}
```

### CLI Tool

```typescript
measureSync('Build Project', (m) => {
  const config = m('Load config', () => loadConfig('./project.toml'));
  if (!config) process.exit(1);

  m('Compile', () => compile(config));
  m('Bundle', () => bundle(config));
  m('Write output', () => writeOutput(config.outDir));
});
```

## Types

```typescript
export type MeasureFn = {
  <U>(label: string | object, fn: () => Promise<U>): Promise<U | null>;
  <U>(label: string | object, fn: (m: MeasureFn) => Promise<U>): Promise<U | null>;
  (label: string | object): Promise<null>;
};

export type MeasureSyncFn = {
  <U>(label: string | object, fn: () => U): U | null;
  <U>(label: string | object, fn: (m: MeasureSyncFn) => U): U | null;
  (label: string | object): null;
};
```

## Zero Dependencies

`measure-fn` has **zero runtime dependencies**. It uses only `performance.now()` and `console.log`/`console.error`. It works in Bun, Node, Deno, or any JavaScript runtime.

## License

MIT
