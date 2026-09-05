import { slugify } from "../core/strings.js";

export class Widget {
  constructor(name) {
    this.name = name;
  }

  render() {
    return slugify(this.name);
  }

  #secret() {}
}

export function mount(node) {
  return node;
}

export const helper = (a, b = 1) => a + b;

export const PLAIN = 3;
