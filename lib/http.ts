// Node's fetch has no default timeout, so an endpoint that goes quiet holds a portal
// mutation open until the platform kills the request.
export const EXTERNAL_REQUEST_TIMEOUT_MS = 15_000;

export function requestTimeout(): AbortSignal {
  return AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS);
}

export function transportFailure(error: unknown): string {
  const { name, cause } = Object(error) as { name?: string; cause?: unknown };
  if (name === "TimeoutError") {
    return `No answer within ${EXTERNAL_REQUEST_TIMEOUT_MS / 1000} seconds`;
  }
  // fetch says "fetch failed" and nothing else; the cause names the failure.
  return cause instanceof Error ? cause.message : String(error);
}
