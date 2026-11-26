declare module 'node:test' {
  export function test(nome: string, fn: () => unknown): void;
  export function after(fn: () => unknown): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(a: unknown, b: unknown, messaggio?: string): void;
    deepEqual(a: unknown, b: unknown, messaggio?: string): void;
    ok(valore: unknown, messaggio?: string): void;
    match(valore: string, re: RegExp, messaggio?: string): void;
    doesNotMatch(valore: string, re: RegExp, messaggio?: string): void;
    rejects(fn: () => unknown): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:crypto' {
  export function createHmac(algoritmo: string, chiave: string | Uint8Array): { update(dati: string | Uint8Array): { digest(codifica?: string): any } };
}

declare module 'node:module' {
  export function register(specificatore: string, genitore?: string | URL): void;
}
