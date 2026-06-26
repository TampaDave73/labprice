interface ErrorContext {
  userId?: string;
  path?: string;
  [key: string]: unknown;
}

export function logError(error: unknown, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(JSON.stringify({
    level: 'error',
    timestamp,
    message: err.message,
    stack: err.stack,
    ...context,
  }));
}

export function trackMetric(name: string, value: number, tags?: Record<string, string>): void {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    level: 'metric',
    timestamp,
    name,
    value,
    ...tags,
  }));
}

export async function measureDuration<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    trackMetric(`${name}.duration_ms`, Math.round(performance.now() - start), { status: 'ok' });
    return result;
  } catch (error) {
    trackMetric(`${name}.duration_ms`, Math.round(performance.now() - start), { status: 'error' });
    throw error;
  }
}
