export type Slug = string & { readonly brand: unique symbol };

export enum Case {
  Lower,
  Upper,
}

export function slugify(value: string): string {
  return value.toLowerCase();
}

export function overloaded(value: string): string;
export function overloaded(value: number): string;
export function overloaded(value: unknown): string {
  return String(value);
}
