import { describe, expect, it } from "vitest";

import { inferLanguage, isSourceFile } from "../languages.js";

const languageOf = (files: readonly string[]): Array<string | undefined> => files.map(inferLanguage);

describe("inferLanguage", () => {
  it("covers the .NET extensions", () => {
    expect(
      languageOf(["Program.cs", "Build.csx", "Library.vb", "Domain.fs", "Script.fsx", "Types.fsi"]),
    ).toEqual(["csharp", "csharp", "vbnet", "fsharp", "fsharp", "fsharp"]);
    expect(languageOf(["Index.cshtml", "Counter.razor", "Index.vbhtml"])).toEqual([
      "razor",
      "razor",
      "razor",
    ]);
  });

  it("covers the Python extensions", () => {
    expect(languageOf(["main.py", "types.pyi", "app.pyw", "fast.pyx"])).toEqual([
      "python",
      "python",
      "python",
      "cython",
    ]);
  });

  it("covers the Go extensions", () => {
    expect(languageOf(["main.go", "user.proto"])).toEqual(["go", "protobuf"]);
  });

  it("covers the Java and Kotlin extensions", () => {
    expect(
      languageOf(["App.java", "App.kt", "build.kts", "Task.groovy", "index.jsp", "App.scala"]),
    ).toEqual(["java", "kotlin", "kotlin", "groovy", "jsp", "scala"]);
  });

  it("covers the PHP extensions", () => {
    expect(languageOf(["User.php", "layout.phtml", "users.blade.php"])).toEqual([
      "php",
      "php",
      "php",
    ]);
  });

  it("covers the Rust and Ruby extensions", () => {
    expect(languageOf(["main.rs", "user.rb", "release.rake"])).toEqual(["rust", "ruby", "ruby"]);
  });

  it("ignores the case of the extension", () => {
    expect(languageOf(["Program.CS", "Main.GO", "User.PY"])).toEqual(["csharp", "go", "python"]);
  });

  it("reads the extension from the file name, not the path", () => {
    expect(inferLanguage("src/api.v2/handler.go")).toBe("go");
    expect(inferLanguage("src/api.v2/Makefile")).toBeUndefined();
  });

  it("leaves manifests, lockfiles and data out", () => {
    expect(
      languageOf([
        "Api.csproj",
        "Api.sln",
        "go.mod",
        "go.sum",
        "pyproject.toml",
        "composer.lock",
        "Gemfile.lock",
        "packages.lock.json",
        "users.golden.json",
        ".gitignore",
      ]),
    ).toEqual(Array(10).fill(undefined));
  });

  it("agrees with isSourceFile", () => {
    expect(isSourceFile("src/Program.cs")).toBe(true);
    expect(isSourceFile("src/Api.csproj")).toBe(false);
  });
});
