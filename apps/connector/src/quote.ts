/**
 * POSIX shell quoting and validation utilities.
 * Copied from apps/server/src/ssh/quote.ts (K2 deletes the old jump-host code).
 */

/**
 * Escapes a string for safe use in a POSIX shell using single-quote escaping.
 * The result can be safely passed as a shell argument.
 *
 * @example
 * shellQuote("hello world") // => 'hello world'
 * shellQuote("it's") // => 'it'"'"'s'
 */
export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Validates a Docker container name.
 * Container names must start with an alphanumeric character, followed by up to 254
 * characters of alphanumerics, underscores, dots, or hyphens.
 *
 * @example
 * isSafeContainerName("my-app_1.prod") // => true
 * isSafeContainerName("1app") // => false (starts with digit)
 * isSafeContainerName("app@test") // => false (invalid character)
 */
export function isSafeContainerName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(name);
}
