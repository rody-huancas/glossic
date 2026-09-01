import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { PreferencesLocation } from "../preferences.js";
import { preferencesPath, readPreferences, writePreferences } from "../preferences.js";

const tempDirs: string[] = [];

const sandbox = async (): Promise<PreferencesLocation> => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-prefs-"));
  tempDirs.push(home);
  return { env: {}, platform: "linux", homedir: home };
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("preferencesPath", () => {
  it("uses APPDATA on Windows", () => {
    expect(
      preferencesPath({ platform: "win32", env: { APPDATA: "C:\\Users\\rody\\AppData\\Roaming" } }),
    ).toBe(path.join("C:\\Users\\rody\\AppData\\Roaming", "glossic", "config.json"));
  });

  it("falls back to the standard Roaming folder when APPDATA is unset", () => {
    expect(preferencesPath({ platform: "win32", env: {}, homedir: "/home/rody" })).toBe(
      path.join("/home/rody", "AppData", "Roaming", "glossic", "config.json"),
    );
  });

  it("uses XDG_CONFIG_HOME on Linux", () => {
    expect(preferencesPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/tmp/xdg" } })).toBe(
      path.join("/tmp/xdg", "glossic", "config.json"),
    );
  });

  it("falls back to ~/.config on Linux and macOS", () => {
    for (const platform of ["linux", "darwin"] as const) {
      expect(preferencesPath({ platform, env: {}, homedir: "/home/rody" })).toBe(
        path.join("/home/rody", ".config", "glossic", "config.json"),
      );
    }
  });

  it("never puts the file inside the project", () => {
    const target = preferencesPath({ platform: "linux", env: {}, homedir: "/home/rody" });
    expect(path.isAbsolute(target)).toBe(true);
    expect(target).not.toContain(process.cwd());
  });
});

describe("readPreferences", () => {
  it("returns nothing when the file has never been written", async () => {
    expect(await readPreferences(await sandbox())).toEqual({});
  });

  it("ignores a corrupt file instead of failing", async () => {
    const location = await sandbox();
    const target   = preferencesPath(location);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "{ not json at all", "utf8");

    expect(await readPreferences(location)).toEqual({});
  });

  it("ignores a file whose shape is wrong", async () => {
    const location = await sandbox();
    const target   = preferencesPath(location);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({ lang: 42 }), "utf8");

    expect(await readPreferences(location)).toEqual({});
  });

  it("reads back what was written", async () => {
    const location = await sandbox();
    await writePreferences({ lang: "pt" }, location);

    expect(await readPreferences(location)).toEqual({ lang: "pt" });
  });
});

describe("writePreferences", () => {
  it("creates the config directory and returns the path", async () => {
    const location = await sandbox();
    const written  = await writePreferences({ lang: "fr" }, location);

    expect(written).toBe(preferencesPath(location));
    await expect(fs.readFile(written, "utf8")).resolves.toContain('"lang": "fr"');
  });

  it("merges rather than replacing", async () => {
    const location = await sandbox();
    await writePreferences({ lang: "de" }, location);
    await writePreferences({}, location);

    expect(await readPreferences(location)).toEqual({ lang: "de" });
  });

  it("overwrites a corrupt file rather than refusing", async () => {
    const location = await sandbox();
    const target   = preferencesPath(location);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "garbage", "utf8");
    await writePreferences({ lang: "it" }, location);

    expect(await readPreferences(location)).toEqual({ lang: "it" });
  });
});
