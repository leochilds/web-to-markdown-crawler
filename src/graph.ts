// graphjs is a CommonJS module that exports { Graph }.
// Bun handles CJS/ESM interop natively.
import { Graph as GraphCtor } from 'graphjs';

export interface GraphInstance {
  dir(u: string, v: string): void;
  adj(u: string): Record<string, unknown>;
  each(fn: (vertex: string, index: number) => void): void;
  order(): number;
}

export function createGraph(): GraphInstance {
  return new GraphCtor();
}
