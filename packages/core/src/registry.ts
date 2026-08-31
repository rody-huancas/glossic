import type { Adapter, Provider } from "@glossic/schema";

/** Minimal name-keyed registry used for adapters and providers. */
export class Registry<T extends { name: string }> {
  readonly #items = new Map<string, T>();

  register(item: T): this {
    this.#items.set(item.name, item);
    return this;
  }

  get(name: string): T | undefined {
    return this.#items.get(name);
  }

  has(name: string): boolean {
    return this.#items.has(name);
  }

  list(): T[] {
    return [...this.#items.values()];
  }

  get size(): number {
    return this.#items.size;
  }
}

export type AdapterRegistry = Registry<Adapter>;
export type ProviderRegistry = Registry<Provider>;

export const createAdapterRegistry = (adapters: Adapter[] = []): AdapterRegistry => {
  const registry = new Registry<Adapter>();
  for (const adapter of adapters) registry.register(adapter);
  return registry;
};

export const createProviderRegistry = (providers: Provider[] = []): ProviderRegistry => {
  const registry = new Registry<Provider>();
  for (const provider of providers) registry.register(provider);
  return registry;
};
