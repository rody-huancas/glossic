const stamp = (level) => `[${level}]`;

export const logger = {
  info: (...args) => console.log(stamp("info"), ...args),
  error: (...args) => console.error(stamp("error"), ...args),
};
