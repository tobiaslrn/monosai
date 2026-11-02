/**
 * Compile-time exhaustiveness guard for discriminated unions.
 * Reaching it at runtime means an unhandled variant escaped validation.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`Unhandled variant in ${context}: ${JSON.stringify(value)}`);
}
