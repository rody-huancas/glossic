import fs from "node:fs/promises";

/** True when the path can be reached; never throws. */
export const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

/** File contents, or undefined when it cannot be read. */
export const readText = async (target: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    return undefined;
  }
};

/** Parsed JSON, or undefined when the file is missing or malformed. */
export const readJson = async <T>(target: string): Promise<T | undefined> => {
  const raw = await readText(target);
  
  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};
