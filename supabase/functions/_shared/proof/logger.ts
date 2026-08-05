type LogLevel = "info" | "warn" | "error";

const sensitiveKeys =
  /authorization|api[-_]?key|secret|token|password|document|payload/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map((
        [key, entry],
      ) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : sanitize(entry)]),
    );
  }
  return value;
}

function write(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const safeContext = sanitize(context) as Record<string, unknown>;
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    integration: "proof",
    level,
    event,
    ...safeContext,
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

export const proofLogger = {
  request: (context: Record<string, unknown>) =>
    write("info", "api_request", context),
  response: (context: Record<string, unknown>) =>
    write("info", "api_response", context),
  retry: (context: Record<string, unknown>) =>
    write("warn", "api_retry", context),
  idempotency: (context: Record<string, unknown>) =>
    write("info", "idempotency", context),
  error: (context: Record<string, unknown>) => write("error", "error", context),
};
