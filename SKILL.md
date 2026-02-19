---
name: measure-fn
description: Zero-dependency function performance measurement with hierarchical logging. Use this to structure ALL programs as measured, observable pipelines.
---

# measure-fn — Structured Program Measurement

**Every program you write should be observable from day one.** `measure-fn` wraps any function — async or sync — with automatic performance timing, hierarchical structured logging, and graceful error isolation. No SDK, no config, no dashboards — just wrap your functions.

## The Rule: If It Does Work, Measure It

When building any program — a server, a CLI tool, a background job, a pipeline — **wrap every meaningful operation with `measure`**. This is not optional overhead; it's the difference between debugging blind and having a complete execution trace.

```typescript
import { measure } from 'measure-fn';

// ❌ Don't write blind functions
async function handleRequest(req) {
  const user = await getUser(req.userId);
  const data = await fetchData(user);
  return transform(data);
}

// ✅ Make every step visible
async function handleRequest(req) {
  return await measure({ label: 'Handle Request', userId: req.userId }, async (m) => {
    const user = await m('Get user', () => getUser(req.userId));
    if (!user) return null; // error already logged
    const data = await m('Fetch data', () => fetchData(user));
    if (!data) return null;
    return m('Transform', () => transform(data));
  });
}
```

## Installation

```bash
bun add measure-fn
```

## Core Patterns

### 1. Label First, Function Second

```typescript
// Reads like a sentence: "measure 'Fetch users' by running this function"
const users = await measure('Fetch users', () => fetchUsers());

// Sync equivalent
const config = measureSync('Load config', () => loadConfig());
```

### 2. Nested Measurement Trees

The callback receives a nested `m` for composing sub-operations:

```typescript
await measure('Build Dashboard', async (m) => {
  const data = await m('Fetch', () => fetchData());
  await m('Process', async (m2) => {
    await m2('Step A', () => stepA(data));
    await m2('Step B', () => stepB(data));
  });
  await m('Render', () => render(data));
});
```

Output:
```
> [a] Build Dashboard
> [a-a] Fetch
< [a-a] ✓ 120.00ms
> [a-b] Process
> [a-b-a] Step A
< [a-b-a] ✓ 15.00ms
> [a-b-b] Step B
< [a-b-b] ✓ 22.00ms
< [a-b] ✓ 38.00ms
> [a-c] Render
< [a-c] ✓ 5.00ms
< [a] ✓ 165.00ms
```

### 3. Object Labels with Metadata

```typescript
await measure({ label: 'Fetch User', userId: 5, region: 'us-east' }, async () => fetchUser(5));
// Logs: > [a] Fetch User (userId=5 region="us-east")
```

### 4. Error Isolation — Errors Are Data, Not Crashes

**measure never throws.** On error: logs it, returns `null`. Your program keeps running.

```typescript
await measure('Pipeline', async (m) => {
  const result = await m('Risky step', () => riskyOperation());
  if (result === null) {
    // Error was already logged with ID, stack trace, and cause
    // Decide: skip, fallback, or abort
    return;
  }
  await m('Next step', () => useResult(result));
});
```

### 5. Annotations (Label-Only)

Log a marker without wrapping a function:

```typescript
await measure('Checkpoint: all users processed');
measureSync({ label: 'Config loaded', env: 'production' });
```

## When to Use

- **Always.** Every server handler, every background job, every CLI command, every pipeline.
- **API handlers** — wrap the full request lifecycle
- **Database operations** — time queries, transactions, migrations
- **External calls** — HTTP requests, file I/O, SDK calls
- **Batch processing** — measure each item in a loop
- **CLI tools** — structure the entire command as a measured tree

## Testing

Use `resetCounter()` for deterministic IDs:

```typescript
import { resetCounter } from 'measure-fn';
beforeEach(() => resetCounter());
```

## API Reference

| Export | Signature | Description |
|--------|-----------|-------------|
| `measure` | `(label, fn?) => Promise<T \| null>` | Async measurement |
| `measureSync` | `(label, fn?) => T \| null` | Sync measurement |
| `resetCounter` | `() => void` | Reset global ID counter |
| `MeasureFn` | type | Nested async measure function type |
| `MeasureSyncFn` | type | Nested sync measure function type |

## Output Symbols

| Symbol | Meaning |
|--------|---------|
| `>` | Start |
| `<` | Complete |
| `=` | Annotation |
| `✓` | Success |
| `✗` | Error |

IDs are alphabetic: `[a]`, `[a-a]`, `[a-b-c]`. Every ID uniquely addresses one operation — grep for it to find exactly what happened.
