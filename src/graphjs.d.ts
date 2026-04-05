declare module 'graphjs' {
  class Graph {
    constructor(data?: Record<string, string[]>);
    dir(u: string, v: string): void;
    adj(u: string): Record<string, unknown>;
    each(fn: (vertex: string, index: number) => void): void;
    order(): number;
    has(u: string, v: string): boolean;
    drop(u: string): void;
  }
  export { Graph };
}
