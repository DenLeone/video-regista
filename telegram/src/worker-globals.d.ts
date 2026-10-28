declare module 'cloudflare:workers' {
  export class DurableObject {
    ctx: {
      storage: {
        get(k: string): Promise<unknown>;
        put(k: string, v: unknown): Promise<void>;
        delete(k: string): Promise<void>;
        setAlarm(quando: number): Promise<void>;
      };
    };
    env: unknown;
    constructor(ctx: unknown, env: unknown);
  }
}

interface DurableObjectNamespace<T = unknown> {
  idFromName(name: string): unknown;
  get(id: unknown): T;
}
