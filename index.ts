const toAlpha = (num: number): string => {
  let result = '';
  let n = num;
  do {
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
};

// Shared helpers
const buildActionLabel = (actionInternal: string | object): string => {
  return typeof actionInternal === 'object' && actionInternal !== null && 'label' in actionInternal
    ? String(actionInternal.label)
    : String(actionInternal);
};

const buildLogMessage = (
  prefix: string,
  actionLabel: string,
  actionInternal: string | object,
  fullIdChainStr: string
): string => {
  let logMessage = `${prefix} ${fullIdChainStr} ${actionLabel}`;
  if (typeof actionInternal === 'object' && actionInternal !== null) {
    const details = { ...actionInternal };
    if ('label' in details) delete details.label;
    if (Object.keys(details).length > 0) {
      const params = Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      logMessage += ` (${params})`;
    }
  }
  return logMessage;
};

const logStart = (fullIdChainStr: string, actionInternal: string | object) => {
  const actionLabel = buildActionLabel(actionInternal);
  const logMessage = buildLogMessage('>', actionLabel, actionInternal, fullIdChainStr);
  console.log(logMessage);
};

const logNested = (fullIdChainStr: string, actionInternalNested: string | object) => {
  if (!actionInternalNested) return;
  const actionLabelNested = buildActionLabel(actionInternalNested);
  const logMessageNested = buildLogMessage('=', actionLabelNested, actionInternalNested, fullIdChainStr);
  console.log(logMessageNested);
};

const logSuccess = (fullIdChainStr: string, duration: number) => {
  console.log(`< ${fullIdChainStr} ✓ ${duration.toFixed(2)}ms`);
};

const logError = (fullIdChainStr: string, duration: number, error: unknown) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.log(`< ${fullIdChainStr} ✗ ${duration.toFixed(2)}ms (${errorMsg})`);
  if (error instanceof Error) {
    console.error(`${fullIdChainStr}`, error.stack ?? error.message);
    if (error.cause) {
      console.error(`${fullIdChainStr} Cause:`, error.cause);
    }
  } else {
    console.error(`${fullIdChainStr}`, error);
  }
};

/** Nested measure function — label first, fn second (or just a label for annotation) */
export type MeasureFn = {
  <U>(label: string | object, fn: () => Promise<U>): Promise<U | null>;
  <U>(label: string | object, fn: (m: MeasureFn) => Promise<U>): Promise<U | null>;
  (label: string | object): Promise<null>;
};

/** Nested measureSync function — label first, fn second (or just a label for annotation) */
export type MeasureSyncFn = {
  <U>(label: string | object, fn: () => U): U | null;
  <U>(label: string | object, fn: (m: MeasureSyncFn) => U): U | null;
  (label: string | object): null;
};

const createNestedResolver = (
  isAsync: boolean,
  fullIdChain: string[],
  childCounterRef: { value: number },
  resolver: <U>(fn: any, action: any, chain: (string | number)[]) => Promise<U | null> | (U | null)
) => {
  return (...args: any[]) => {
    // New order: (label, fn?) — label is always first
    const label = args[0];
    const fn = args[1];

    if (typeof fn === 'function') {
      const childParentChain = [...fullIdChain, childCounterRef.value++];
      return resolver(fn, label, childParentChain);
    } else {
      logNested(`[${fullIdChain.join('-')}]`, label);
      return isAsync ? Promise.resolve(null) : null;
    }
  };
};

let globalRootCounter = 0;

/** Reset the global counter — useful for deterministic test output */
export const resetCounter = () => {
  globalRootCounter = 0;
};

/**
 * Measure an async operation with hierarchical logging.
 *
 * @param label - A string or object describing the operation
 * @param fn - The async function to measure (receives nested `measure` as argument)
 *
 * @example
 * ```ts
 * await measure('Fetch users', async (m) => {
 *   const user = await m('Get user 1', () => fetchUser(1));
 *   await m('Get posts', () => fetchPosts(user.id));
 * });
 * ```
 */
export const measure = async <T = null>(
  arg1: string | object,
  arg2?: ((measure: MeasureFn) => Promise<T>)
): Promise<T | null> => {
  const _measureInternal = async <U>(
    fnInternal: (measure: MeasureFn) => Promise<U>,
    actionInternal: string | object,
    parentIdChain: (string | number)[]
  ): Promise<U | null> => {
    const start = performance.now();
    const childCounterRef = { value: 0 };

    const currentId = toAlpha(parentIdChain.pop() ?? 0);
    const fullIdChain = [...parentIdChain, currentId];
    const fullIdChainStr = `[${fullIdChain.join('-')}]`;

    logStart(fullIdChainStr, actionInternal);

    const measureForNextLevel = createNestedResolver(true, fullIdChain, childCounterRef, _measureInternal);

    try {
      const result = await fnInternal(measureForNextLevel as MeasureFn);
      const duration = performance.now() - start;
      logSuccess(fullIdChainStr, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      logError(fullIdChainStr, duration, error);
      return null;
    }
  };

  if (typeof arg2 === 'function') {
    return _measureInternal(arg2, arg1, [globalRootCounter++]) as Promise<T | null>;
  } else {
    const currentId = toAlpha(globalRootCounter++);
    const fullIdChainStr = `[${currentId}]`;
    logStart(fullIdChainStr, arg1);
    return Promise.resolve(null);
  }
};

/**
 * Measure a synchronous operation with hierarchical logging.
 *
 * @param label - A string or object describing the operation
 * @param fn - The sync function to measure (receives nested `measureSync` as argument)
 *
 * @example
 * ```ts
 * const result = measureSync('Parse config', () => {
 *   return JSON.parse(configStr);
 * });
 * ```
 */
export const measureSync = <T = null>(
  arg1: string | object,
  arg2?: ((measure: MeasureSyncFn) => T)
): T | null => {
  const _measureInternalSync = <U>(
    fnInternal: (measure: MeasureSyncFn) => U,
    actionInternal: string | object,
    parentIdChain: (string | number)[]
  ): U | null => {
    const start = performance.now();
    const childCounterRef = { value: 0 };

    const currentId = toAlpha(parentIdChain.pop() ?? 0);
    const fullIdChain = [...parentIdChain, currentId];
    const fullIdChainStr = `[${fullIdChain.join('-')}]`;

    logStart(fullIdChainStr, actionInternal);

    const measureForNextLevel = createNestedResolver(false, fullIdChain, childCounterRef, _measureInternalSync);

    try {
      const result = fnInternal(measureForNextLevel as MeasureSyncFn);
      const duration = performance.now() - start;
      logSuccess(fullIdChainStr, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      logError(fullIdChainStr, duration, error);
      return null;
    }
  };

  if (typeof arg2 === 'function') {
    return _measureInternalSync(arg2, arg1, [globalRootCounter++]) as T | null;
  } else {
    const currentId = toAlpha(globalRootCounter++);
    const fullIdChainStr = `[${currentId}]`;
    logStart(fullIdChainStr, arg1);
    return null;
  }
};
