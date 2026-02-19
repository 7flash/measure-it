import { measure, measureSync, configure, createMeasure, safeStringify, type MeasureFn } from "./index.ts";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchUser(userId: number) {
  await sleep(50 + Math.random() * 50);
  if (userId === 999) throw new Error('User not found', { cause: { userId } });
  return { id: userId, name: `User ${userId}` };
}

async function flakyApi() {
  await sleep(30);
  if (Math.random() < 0.6) throw new Error('Service unavailable');
  return { status: 'ok' };
}

async function main() {
  configure({ timestamps: true });

  // ─── Sync leaf: single line + auto-printed result ──────────────
  measureSync('Load config', () => ({ env: 'prod', port: 3000 }));

  // ─── Annotation ────────────────────────────────────────────────
  measureSync('App ready');

  // ─── Sync with children ────────────────────────────────────────
  measureSync('Build report', (m) => {
    const raw = m('Parse CSV', () => 'col1,col2\nval1,val2');
    const rows = m('Split rows', () => raw?.split('\n') ?? []);
    return { rows, count: rows?.length ?? 0 };
  });

  // ─── Circular ref (safe stringify) ─────────────────────────────
  measureSync('Circular ref', () => {
    const obj: any = { name: 'root' };
    obj.self = obj;
    return obj;
  });

  // ─── Parallel async (interleaved) ──────────────────────────────
  await measure('Parallel Fetch', async (m) => {
    await Promise.all([
      m({ label: 'Fetch User', userId: 1 }, () => fetchUser(1)),
      m({ label: 'Fetch User', userId: 2 }, () => fetchUser(2)),
      m({ label: 'Fetch User', userId: 3 }, () => fetchUser(3)),
    ]);
  });

  // ─── Budget: warn when operation exceeds time limit ────────────
  await measure({ label: 'DB query', budget: 30 }, async () => {
    await sleep(80); // intentionally slow
    return { rows: 42 };
  });

  // ─── Retry with backoff ────────────────────────────────────────
  await measure.retry('Flaky API', { attempts: 3, delay: 100, backoff: 2 }, flakyApi);

  // ─── Assert: throws if null ────────────────────────────────────
  const user = await measure.assert('Assert user', () => fetchUser(1));
  console.log(`Asserted: ${user.name}`);

  // ─── Wrap: decorator pattern ───────────────────────────────────
  const getUser = measure.wrap('Get user', fetchUser);
  await getUser(1);
  await getUser(2);

  // ─── Batch: process array with progress ────────────────────────
  const userIds = Array.from({ length: 20 }, (_, i) => i + 1);
  await measure.batch('Fetch all users', userIds, async (id) => {
    return await fetchUser(id);
  }, { every: 5 });

  // ─── Scoped instances ──────────────────────────────────────────
  const api = createMeasure('api');
  const db = createMeasure('db');

  await api.measure('GET /users', async () => {
    return await db.measure('SELECT users', async () => {
      await sleep(30);
      return [{ id: 1 }, { id: 2 }];
    });
  });

  // ─── safeStringify utility ─────────────────────────────────────
  const circular: any = { a: 1 };
  circular.self = circular;
  console.log(`safeStringify: ${safeStringify(circular)}`);

  // ─── Smart duration formatting (simulated long op) ─────────────
  await measure('Quick op', async () => {
    await sleep(5);
    return 'fast';
  });

  await measure('Slow op', async () => {
    await sleep(1200);
    return 'slow';
  });
}

main().then(() => console.log('\n✅ Done.'));
