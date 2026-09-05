import { slugify } from "./strings.js";
import type { Order } from "./types.js";

export const VERSION = "1";

export interface Repository<T> {
  find(id: string): Promise<T | undefined>;
  readonly size: number;
}

export abstract class BaseService {
  abstract run(): void;
}

export class OrderService extends BaseService implements Repository<Order> {
  readonly size = 0;

  constructor(private readonly prefix: string) {
    super();
  }

  async find(id: string): Promise<Order | undefined> {
    return { id: slugify(id) };
  }

  run(): void {}

  private hidden(): void {}

  protected alsoHidden(): void {}

  #reallyHidden(): void {}
}

export function label<T>(value: T, fallback = "none"): string {
  return String(value ?? fallback);
}

export const build = async (prefix: string): Promise<OrderService> => new OrderService(prefix);

export const { a, b } = { a: 1, b: 2 };

function internal(): number {
  return 1;
}

const alsoInternal = 2;

export { internal, alsoInternal as renamed };
