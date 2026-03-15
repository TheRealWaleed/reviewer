const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
}

function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object") {
    // Fetch Response errors (GitLabApiError has statusCode)
    if ("statusCode" in err && typeof err.statusCode === "number") {
      return RETRYABLE_STATUS_CODES.has(err.statusCode);
    }
    // Octokit errors have status property
    if ("status" in err && typeof err.status === "number") {
      return RETRYABLE_STATUS_CODES.has(err.status);
    }
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const maxRetries = opts?.retries ?? DEFAULT_RETRIES;
  const baseDelay = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryable(err)) {
        await delay(baseDelay * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
