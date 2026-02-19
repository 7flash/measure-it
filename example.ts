import { measure, measureSync, type MeasureFn } from "./index.ts";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchUser(userId: number) {
  await sleep(100);
  if (userId === 999) throw new Error('User not found', { cause: { userId } });
  return { id: userId, name: `User ${userId}` };
}

async function fetchPosts(userId: number) {
  await sleep(150);
  return [{ id: 1, title: 'First Post', userId }];
}
async function fetchComments(postId: number) {
  await sleep(80);
  return [{ id: 1, text: 'Great post!', postId }];
}
function syncFetch() {
  do {
  } while (Math.random() < 0.99999999);
  return 42;
}

async function comprehensiveWorkflow() {
  // Sync: label first, fn second
  const syncValue = measureSync('get sync value', syncFetch);

  // Annotation-only call (label only, no fn)
  if (syncValue !== null) {
    measureSync(`sync returned ${syncValue}`);
  }

  // Async: label first, fn second
  await measure('Comprehensive Workflow Example', async (m) => {
    const syncValue = await m('get sync value', syncFetch);
    await m({ label: 'noop measure object', values: [syncValue] });

    const user1 = await m(
      { label: 'Fetch User', userId: 1 },
      () => fetchUser(1)
    );

    // @note measure never throws, only returns null in case of exception
    await m(
      { label: 'Fetch Invalid User', userId: 999 },
      () => fetchUser(999)
    );

    await m('Fetch Multiple Users in Parallel', async (m2: MeasureFn) => {
      const userPromises = [2, 3, 4].map(id =>
        m2({ label: 'Fetch User', userId: id }, () => fetchUser(id))
      );
      await Promise.all(userPromises);
    });

    if (user1 === null) return;

    await m('Enrich Posts with Comments', async (m2: MeasureFn) => {
      const posts = await m2({ label: 'Fetch Posts', userId: user1.id }, () => fetchPosts(user1.id));

      if (posts === null) return;
      for (const post of posts) {
        await m2({ label: 'Fetch Comments', postId: post.id }, () => fetchComments(post.id));
      }
    });
  });
}

// To run it:
comprehensiveWorkflow().then(() => {
  console.log('\n✅ Workflow complete.');
});
