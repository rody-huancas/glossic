/**
 * Every command is a stub for now: print a marker and exit successfully so the
 * scaffold stays scriptable while the real pipeline is built.
 */
export const notImplemented = (command: string): void => {
  process.stdout.write(`${command}: not implemented\n`);
};
