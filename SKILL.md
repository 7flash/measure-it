---
name: measure-fn
description: Zero-dependency function performance measurement with hierarchical logging. Use this to structure ALL programs as measured, observable pipelines.
---

# measure-fn — Structured Program Measurement

**Every program you write should be observable from day one.**

## Installation

```bash
bun add measure-fn
```

## Output Format

```
[id] ... label          — start (async / sync with children)
[id] ✓ label Nms → val  — success with auto-printed result
[id] ✗ label Nms (err)  — error
[id] = label            — annotation / progress
```

No indentation, no colors. IDs encode hierarchy. Smart duration: `0.10ms` → `1.2s` → `2m 5s`.

## Core API

```typescript
import { measure, measureSync, createMeasure, configure } from 'measure-fn';

// Async
const users = await measure('Fetch users', () => fetchUsers());

// Sync (leaf = single line)
const config = measureSync('Load config', () => loadConfig());

// Nested + parallel
await measure('Pipeline', async (m) => {
  await Promise.all([
    m({ label: 'Fetch', userId: 1 }, () => fetchUser(1)),
    m({ label: 'Fetch', userId: 2 }, () => fetchUser(2)),
  ]);
});

// Wrap: decorator pattern — wrap once, measure every call
const getUser = measure.wrap('Get user', fetchUser);
await getUser(1);
await getUser(2);

// Batch: process array with progress logging
await measure.batch('Process', items, async (item) => transform(item), { every: 100 });

// Retry: automatic retry with backoff
await measure.retry('Flaky', { attempts: 3, delay: 1000, backoff: 2 }, () => flakyApi());

// Assert: throws if null (type-narrowing)
const user = await measure.assert('Get user', () => fetchUser(1));

// Budget: warn when operation exceeds time limit
await measure({ label: 'DB query', budget: 100 }, () => query());

// Scoped: separate namespace and counter
const api = createMeasure('api');  // → [api:a], [api:b], ...
const db = createMeasure('db');    // → [db:a], [db:b], ...
```

## Configuration

```typescript
configure({
  silent: true,            // suppress output
  timestamps: true,        // [HH:MM:SS.mmm] prefix
  maxResultLength: 200,    // result truncation (default: 80)
  logger: (event) => ...,  // custom event handler
});
```

Env: `MEASURE_SILENT=1`, `MEASURE_TIMESTAMPS=1`

## Utilities

```typescript
import { safeStringify, formatDuration, resetCounter } from 'measure-fn';
```

## API Reference

| Export | Description |
|--------|-------------|
| `measure(label, fn?)` | Async measurement |
| `measure.timed(label, fn?)` | Returns `{ result, duration }` |
| `measure.retry(label, opts, fn)` | Retry with backoff |
| `measure.assert(label, fn)` | Throws if null |
| `measure.wrap(label, fn)` | Returns measured version of fn |
| `measure.batch(label, items, fn, opts?)` | Array processing with progress |
| `measureSync(label, fn?)` | Sync measurement |
| `measureSync.timed/assert/wrap` | Sync variants |
| `createMeasure(prefix)` | Scoped instance |
| `configure(opts)` | Runtime configuration |
| `resetCounter()` | Reset global ID counter |
| `safeStringify(value)` | Safe JSON with circular ref handling |
| `formatDuration(ms)` | Smart duration formatting |

## Testing

```typescript
import { resetCounter, configure } from 'measure-fn';
beforeEach(() => {
  resetCounter();
  configure({ silent: false, logger: null, timestamps: false });
});
```
