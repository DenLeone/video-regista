declare module 'node:test' {
  export function test(nome: string, fn: () => unknown): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(a: unknown, b: unknown, messaggio?: string): void;
    deepEqual(a: unknown, b: unknown, messaggio?: string): void;
    ok(valore: unknown, messaggio?: string): void;
    match(valore: string, re: RegExp, messaggio?: string): void;
    rejects(fn: () => unknown): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}
