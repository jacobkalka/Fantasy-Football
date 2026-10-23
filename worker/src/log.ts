/**
 * One line per message, with the time first, so Railway's log view stays readable.
 * Never pass secrets in here: describeError() also scrubs connection strings
 * from error messages, just in case a library includes one.
 */

export type Logger = (message: string) => void;

export const log: Logger = (message) => {
  console.log(`${new Date().toISOString()} ${message}`);
};

/** A short, safe description of an error for the logs and /health. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/password=\S+/gi, "password=***")
    .slice(0, 300);
}
