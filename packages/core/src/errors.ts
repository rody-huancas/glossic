/** Thrown by every scaffold stub until the real implementation lands. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = "NotImplementedError";
  }
}
