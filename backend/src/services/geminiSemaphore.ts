/**
 * Global semaphore for Gemini API calls.
 * Limits concurrent requests to avoid 429 RESOURCE_EXHAUSTED errors.
 */

const MAX_CONCURRENT = 3;
let running = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      running++;
      resolve();
    });
  });
}

function release(): void {
  running--;
  const next = queue.shift();
  if (next) next();
}

/**
 * Execute a function with Gemini concurrency control.
 * At most MAX_CONCURRENT calls run simultaneously.
 */
export async function withGeminiSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Run multiple promises with controlled concurrency.
 * Returns results in the same order as input tasks.
 */
export async function parallelWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number = MAX_CONCURRENT,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}
