
// Measure context and logging
export type MeasureContext = {
  requestId?: string;
  level?: number;
  parentAction?: string;
  idChain?: string[]; // Chain of nested IDs
};

export async function measure<T>(
  fn: (measure: typeof measure) => Promise<T>,
  action: string,
  context: MeasureContext = {}
): Promise<T> {
  const start = performance.now();
  const currentId = Math.random().toString(36).substring(2, 8);
  const parentIdChain = (context.idChain || []).map(id => `[${id}]`).join('');
  const fullIdChain = [...(context.idChain || []), currentId].map(id => `[${id}]`).join('');

  try {
    // Opening: show parent chain + action + new ID
    if (parentIdChain) {
      console.log(`> ${parentIdChain} ${action} (${currentId})`);
    } else {
      console.log(`> ${action} (${currentId})`);
    }

    const result = await fn((nestedFn, nestedAction) =>
      measure(nestedFn, nestedAction, {
        ...context,
        idChain: [...(context.idChain || []), currentId],
        level: (context.level || 0) + 1,
        parentAction: action,
      })
    );

    const duration = performance.now() - start;
    console.log(`< ${fullIdChain} ✓ ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    // console.log('=========================== ERROR ===========================');
    console.log(`< ${fullIdChain} ✗ FAILED ${duration.toFixed(2)}ms`);
    if (error instanceof Error) {
      console.error(`${fullIdChain}`, error.message);
      if (error.stack) console.error(error.stack);
    } else {
      console.error(`${fullIdChain}`, error);
    }
    // console.log('=============================================================');
    // throw error;
    return null;
  }
}