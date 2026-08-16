type Level = "info" | "warn" | "error";

function emit(
  level: Level,
  event: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields: Record<string, unknown> = {}) =>
    emit("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    emit("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    emit("error", event, fields),
};
