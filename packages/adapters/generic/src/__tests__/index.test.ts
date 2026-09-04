import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoverContext, Project, Unit } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import { genericAdapter, genericAdapterName } from "../index.js";

const exampleDir = (name: string): string =>
  fileURLToPath(new URL(`../../../../../examples/${name}`, import.meta.url));

/**
 * The fixtures are small enough that the default subtree merge would collapse
 * each one into a single unit, so these tests turn it off and exercise the
 * directory grouping directly. One test below covers the default.
 */
const contextFor = (root: string, rootDir = ".", mergeChildrenInto = 1): DiscoverContext => {
  const project: Project = { id: "root", name: path.basename(root), rootDir };
  return {
    root,
    project,
    config: GlossicConfigSchema.parse({ mergeChildrenInto }),
    workspace: {
      name: path.basename(root),
      root,
      isMonorepo: false,
      tool      : "none",
      projects  : [project],
    },
  };
};

const runAdapter = async (ctx: DiscoverContext): Promise<Unit[]> => {
  const units  = await genericAdapter.discover(ctx);
  const result = await genericAdapter.extract({ ...ctx, units });
  return result.units;
};

const roleOf = (units: readonly Unit[], name: string): string | null | undefined =>
  units.find((unit) => unit.name === name)?.facts.base.roleHint;

const tempDirs: string[] = [];

const makeRepo = async (files: Record<string, string>): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-generic-"));
  tempDirs.push(dir);

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("generic adapter", () => {
  it("is the universal fallback", async () => {
    expect(genericAdapter.name).toBe(genericAdapterName);
    await expect(genericAdapter.detect(contextFor(exampleDir("nestjs-api")))).resolves.toBe(true);
  });

  it("groups directories holding source files into units", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));

    // "src" holds two files, below the floor, but it has units under it, so
    // nothing folds and every role-bearing directory keeps its page. "test"
    // holds nothing but tests, so it never becomes a unit of its own.
    expect(units.map((unit) => unit.name)).toEqual([
      "src",
      "src/common/middleware",
      "src/config",
      "src/users",
      "src/users/dto",
      "src/users/entities",
    ]);
  });

  it("puts loose project-root files in a unit named root", async () => {
    const units = await runAdapter(contextFor(exampleDir("express-api")));

    expect(units.map((unit) => unit.name)).toEqual([
      "root",
      "src/controllers",
      "src/middleware",
      "src/routes",
      "src/utils",
    ]);

    // The root unit holds a single file and keeps it: units live under it, so
    // it is not a leaf, and every directory below it is named for its role.
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual(["index.js"]);
  });

  it("records file facts and language counts", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));
    const dto   = units.find((unit) => unit.name === "src/users/dto");

    expect(dto?.facts.producedBy).toEqual(["generic"]);
    expect(dto?.facts.base.files).toEqual([
      { path: "src/users/dto/create-user.dto.ts", language: "typescript", bytes: 84 },
      { path: "src/users/dto/update-user.dto.ts", language: "typescript", bytes: 84 },
    ]);
    expect(dto?.facts.base.languages).toEqual([{ language: "typescript", count: 2 }]);
  });

  it("infers role hints from nest folder names", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));

    expect(roleOf(units, "src/users/dto")).toBe("dtos");
    expect(roleOf(units, "src/users/entities")).toBe("entities");
    expect(roleOf(units, "src/config")).toBe("config");
    expect(roleOf(units, "src")).toBeNull();
    expect(roleOf(units, "src/users")).toBeNull();
  });

  it("infers role hints from laravel folder names", async () => {
    const units = await runAdapter(contextFor(exampleDir("laravel-api")));

    expect(units.map((unit) => [unit.name, unit.facts.base.roleHint])).toEqual([
      ["app/Http/Controllers", "controllers"],
      ["app/Http/Middleware", "middleware"],
      ["app/Models", "models"],
      ["routes", "routes"],
    ]);
    expect(units[0]?.facts.base.languages).toEqual([{ language: "php", count: 2 }]);
  });

  it("respects .gitignore", async () => {
    const dir = await makeRepo({
      ".gitignore"               : "generated/\n*.gen.ts\n",
      "package.json"             : '{ "name": "ignored-repo" }',
      "src/keep.ts"              : "export const keep = 1;\n",
      "src/skip.gen.ts"          : "export const skip = 1;\n",
      "generated/client.ts"      : "export const client = 1;\n",
      "node_modules/dep/index.js": "module.exports = {};\n",
    });

    const units = await runAdapter(contextFor(dir));

    expect(units.map((unit) => unit.name)).toEqual(["src"]);
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual(["src/keep.ts"]);
  });

  it("respects a nested .gitignore", async () => {
    const dir = await makeRepo({
      "src/.gitignore"        : "vendor-copy/\n",
      "src/app.ts"            : "export const app = 1;\n",
      "src/vendor-copy/lib.ts": "export const lib = 1;\n",
    });

    const units = await runAdapter(contextFor(dir));

    expect(units.map((unit) => unit.name)).toEqual(["src"]);
  });

  it("scopes units and paths to the project inside a monorepo", async () => {
    const ctx   = contextFor(exampleDir("monorepo"), "packages/api");
    const units = await runAdapter({ ...ctx, project: { ...ctx.project, id: "packages/api" } });

    expect(units.map((unit) => unit.id)).toEqual([
      "packages/api:src",
      "packages/api:src/routes",
      "packages/api:src/services",
    ]);
    expect(units[0]?.path).toBe("packages/api/src");
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual([
      "packages/api/src/index.ts",
    ]);
  });

  it("collapses a whole small project into one unit by default", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api"), ".", 25));

    expect(units.map((unit) => unit.name)).toEqual(["src"]);
    expect(units[0]?.facts.base.files).toHaveLength(10);
  });

  /**
   * One entry per ecosystem: the source file that must survive, and the paths
   * a build or a generator leaves behind that must never be documented.
   */
  const BUILD_OUTPUT: ReadonlyArray<{
    ecosystem: string;
    source   : string;
    artifacts: readonly string[];
  }> = [
    {
      ecosystem: ".NET",
      source   : "src/Api/Controllers/UsersController.cs",
      artifacts: [
        "src/Api/obj/Debug/net8.0/Api.AssemblyInfo.cs",
        "src/Api/obj/Debug/net8.0/Api.GlobalUsings.g.cs",
        "src/Api/bin/Debug/net8.0/Api.Startup.cs",
        "src/Api/Migrations/20240101000000_Init.cs",
        "src/Api/Models/User.Designer.cs",
        "TestResults/Api.Coverage.cs",
      ],
    },
    {
      ecosystem: "Python",
      source   : "app/services/user_service.py",
      artifacts: [
        ".venv/lib/python3.11/site-packages/requests/api.py",
        ".tox/py311/lib/python3.11/site-packages/anyio/abc.py",
        "build/lib/app/user_service.py",
        "app/proto/user_pb2.py",
        "app/proto/user_pb2_grpc.py",
        "alembic/versions/0001_init.py",
        "setup.py",
      ],
    },
    {
      ecosystem: "Go",
      source   : "internal/handlers/users.go",
      artifacts: [
        "vendor/github.com/google/uuid/uuid.go",
        "internal/gen/user.pb.go",
        "internal/handlers/zz_generated.deepcopy.go",
        "internal/handlers/wire_gen.go",
        "internal/handlers/role_string.go",
        "internal/handlers/mocks/user_mock.go",
        "internal/handlers/testdata/fixture.go",
      ],
    },
    {
      ecosystem: "Java",
      source   : "src/main/java/com/acme/controller/UserController.java",
      artifacts: [
        "target/classes/com/acme/App.java",
        "target/generated-sources/annotations/com/acme/User_Factory.java",
        "build/generated/source/r/com/acme/R.java",
        "build/generated/source/buildConfig/com/acme/BuildConfig.java",
        "out/production/com/acme/App.java",
        ".gradle/scripts/build.groovy",
      ],
    },
    {
      ecosystem: "Laravel",
      source   : "app/Http/Controllers/UserController.php",
      artifacts: [
        "vendor/laravel/framework/src/Support/Str.php",
        "storage/framework/views/8f3a2b.php",
        "bootstrap/cache/packages.php",
        "public/build/assets/app.php",
        "database/migrations/2024_01_01_000000_create_users_table.php",
        "database/seeders/DatabaseSeeder.php",
        "_ide_helper.php",
      ],
    },
    {
      ecosystem: "Rust",
      source   : "src/handlers/users.rs",
      artifacts: [
        "target/debug/build/api-1a2b/out/bindings.rs",
        "src/bindings.rs",
        "src/schema.gen.rs",
        "benches/throughput.rs",
      ],
    },
    {
      ecosystem: "Ruby",
      source   : "app/controllers/users_controller.rb",
      artifacts: [
        "vendor/bundle/ruby/3.2/gems/rack/lib/rack.rb",
        "tmp/cache/bootsnap/compiled.rb",
        "db/migrate/20240101000000_create_users.rb",
        "db/schema.rb",
        "db/seeds.rb",
      ],
    },
  ];

  it.each(BUILD_OUTPUT)(
    "keeps $ecosystem build output and generated code out of the documented files",
    async ({ source, artifacts }) => {
      const files = Object.fromEntries(
        [source, ...artifacts].map((file) => [file, `// ${file}\n`]),
      );

      const units      = await runAdapter(contextFor(await makeRepo(files)));
      const documented = units.flatMap((unit) => unit.facts.base.files.map((file) => file.path));

      expect(documented).toEqual([source]);
    },
  );

  /**
   * The two mechanisms differ in what they leave behind: `exclude` is never
   * walked at all, while `ignoreUnits` still hashes the file under the unit
   * above it, so touching it invalidates that unit's page.
   */
  it("drops an excluded path but keeps an ignored one in the hash", async () => {
    const dir = await makeRepo({
      "src/Api/Program.cs"                   : "class Program {}\n",
      "src/Api/obj/Debug/Api.AssemblyInfo.cs": "// generated\n",
      "src/Api/bin/Debug/Api.Startup.cs"     : "// copied\n",
    });

    const units = await runAdapter(contextFor(dir));
    const api   = units.find((unit) => unit.name === "src/Api");

    expect(api?.facts.base.files.map((file) => file.path)).toEqual(["src/Api/Program.cs"]);
    expect(api?.facts.base.ignoredFiles.map((file) => file.path)).toEqual([
      "src/Api/bin/Debug/Api.Startup.cs",
    ]);
  });

  it("scans a .NET project into role-bearing units", async () => {
    const units = await runAdapter(contextFor(exampleDir("dotnet-api")));

    expect(units.map((unit) => [unit.name, unit.facts.base.roleHint])).toEqual([
      ["src/DotnetApi", null],
      ["src/DotnetApi/Controllers", "controllers"],
      ["src/DotnetApi/Dtos", "dtos"],
      ["src/DotnetApi/Middleware", "middleware"],
      ["src/DotnetApi/Models", "models"],
      ["src/DotnetApi/Repositories", "repositories"],
      ["src/DotnetApi/Services", "services"],
    ]);

    // PascalCase Migrations only meets the lower-case default because the
    // classifier ignores case; the file still counts towards the unit's hash.
    const project = units[0];

    expect(project?.facts.base.files.map((file) => file.path)).toEqual([
      "src/DotnetApi/Program.cs",
    ]);
    expect(project?.facts.base.ignoredFiles.map((file) => file.path)).toEqual([
      "src/DotnetApi/Migrations/20240117093000_InitialCreate.cs",
    ]);
    expect(project?.facts.base.languages).toEqual([{ language: "csharp", count: 1 }]);
  });

  it("scans a Python project into role-bearing units", async () => {
    const units = await runAdapter(contextFor(exampleDir("python-api")));

    expect(units.map((unit) => [unit.name, unit.facts.base.roleHint])).toEqual([
      ["app", null],
      ["app/api/routes", "routes"],
      ["app/middleware", "middleware"],
      ["app/models", "models"],
      ["app/repositories", "repositories"],
      ["app/schemas", "dtos"],
      ["app/services", "services"],
    ]);

    expect(units[1]?.facts.base.files.map((file) => file.path)).toEqual([
      "app/api/routes/health.py",
      "app/api/routes/users.py",
    ]);
    expect(units[1]?.facts.base.languages).toEqual([{ language: "python", count: 2 }]);
  });

  it("scans a Go project into role-bearing units", async () => {
    const units = await runAdapter(contextFor(exampleDir("go-api")));

    expect(units.map((unit) => [unit.name, unit.facts.base.roleHint])).toEqual([
      ["api", null],
      ["cmd/api", null],
      ["internal/config", "config"],
      ["internal/handlers", "controllers"],
      ["internal/middleware", "middleware"],
      ["internal/models", "models"],
      ["internal/repository", "repositories"],
      ["internal/router", "routes"],
      ["internal/service", "services"],
      ["pkg/apierror", null],
    ]);

    const handlers = units.find((unit) => unit.name === "internal/handlers");

    expect(handlers?.facts.base.files.map((file) => file.path)).toEqual([
      "internal/handlers/health.go",
      "internal/handlers/users.go",
    ]);
    expect(handlers?.facts.base.testFiles.map((file) => file.path)).toEqual([
      "internal/handlers/users_test.go",
    ]);

    // The hand-written .proto is documented; what protoc emitted from it is not.
    const api = units[0];

    expect(api?.facts.base.files.map((file) => file.path)).toEqual(["api/user.proto"]);
    expect(api?.facts.base.ignoredFiles.map((file) => file.path)).toEqual(["api/gen/user.pb.go"]);
  });

  it("produces the same hashes on two consecutive runs", async () => {
    const ctx = contextFor(exampleDir("nestjs-api"));

    const first  = await runAdapter(ctx);
    const second = await runAdapter(ctx);

    expect(second.map((unit) => [unit.id, unit.hash])).toEqual(
      first.map((unit) => [unit.id, unit.hash]),
    );
    expect(new Set(first.map((unit) => unit.hash)).size).toBe(first.length);
  });

  it("hashes the content, not the read order", async () => {
    const dir    = await makeRepo({ "src/a.ts": "export const a = 1;\n" });
    const before = await runAdapter(contextFor(dir));

    await fs.writeFile(path.join(dir, "src/a.ts"), "export const a = 2;\n", "utf8");
    const after = await runAdapter(contextFor(dir));

    expect(after[0]?.hash).not.toBe(before[0]?.hash);
  });
});
