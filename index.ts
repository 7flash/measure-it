
// Measure context and logging
export type MeasureContext = {
  requestId?: string;
  level?: number;
  parentAction?: string;
  idChain?: string[]; // Chain of nested IDs
};

export async function measure<T>(
  fn: (measure: typeof measure) => Promise<T>,
  action: string | object,
  context: MeasureContext = {}
): Promise<T> {
  const start = performance.now();
  const currentId = Math.random().toString(36).substring(2, 8);
  const parentIdChain = (context.idChain || []).map(id => `[${id}]`).join('');
  const fullIdChain = [...(context.idChain || []), currentId].map(id => `[${id}]`).join('');

  try {
    // Handle object vs string action
    const actionLabel = typeof action === 'object' && action !== null && 'label' in action 
      ? String(action.label) 
      : typeof action === 'object' 
        ? String(action) 
        : action;
    
    // Opening: show parent chain + action + new ID
    if (parentIdChain) {
      console.log(`> ${parentIdChain} ${actionLabel} (${currentId})`);
    } else {
      console.log(`> ${actionLabel} (${currentId})`);
    }
    
    // If action is an object, also print it as a table
    if (typeof action === 'object' && action !== null) {
      console.table(action);
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
      console.error(`${fullIdChain}`, error.stack ?? error.message);
    } else {
      console.error(`${fullIdChain}`, error);
    }
    // console.log('=============================================================');
    // throw error;
    return null;
  }
}