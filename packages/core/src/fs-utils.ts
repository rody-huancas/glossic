import fs from "node:fs/promises";

export const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const readText = async (target: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    return undefined;
  }
};

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
