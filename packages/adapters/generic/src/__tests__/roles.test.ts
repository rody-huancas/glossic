import { describe, expect, it } from "vitest";
import type { RoleHint } from "@glossic/schema";

import { inferRoleHint } from "../roles/index.js";

const roles = (names: readonly string[]): Array<RoleHint | null> => names.map(inferRoleHint);

describe("inferRoleHint", () => {
  it("gives the root unit no role", () => {
    expect(inferRoleHint("root")).toBeNull();
  });

  it("reads only the last segment of the unit name", () => {
    expect(inferRoleHint("src/users/dto")).toBe("dtos");
    expect(inferRoleHint("app/Http/Controllers")).toBe("controllers");
    expect(inferRoleHint("internal/handlers")).toBe("controllers");
  });

  it("treats PascalCase and lower case as the same name", () => {
    expect(roles(["Controllers", "controllers", "CONTROLLERS"])).toEqual([
      "controllers",
      "controllers",
      "controllers",
    ]);
    expect(roles(["Models", "models"])).toEqual(["models", "models"]);
    expect(roles(["Repositories", "repositories"])).toEqual(["repositories", "repositories"]);
    expect(roles(["ViewModels", "viewmodels"])).toEqual(["dtos", "dtos"]);
  });

  it("treats singular and plural as the same name", () => {
    expect(roles(["controller", "controllers"])).toEqual(["controllers", "controllers"]);
    expect(roles(["repository", "repositories"])).toEqual(["repositories", "repositories"]);
    expect(roles(["service", "services"])).toEqual(["services", "services"]);
    expect(roles(["job", "jobs"])).toEqual(["jobs", "jobs"]);
    expect(roles(["policy", "policies"])).toEqual(["services", "services"]);
    expect(roles(["entity", "entities"])).toEqual(["entities", "entities"]);
    expect(roles(["middleware", "middlewares"])).toEqual(["middleware", "middleware"]);
  });

  it("knows the .NET conventions", () => {
    expect(inferRoleHint("Controllers")).toBe("controllers");
    expect(inferRoleHint("Models")).toBe("models");
    expect(inferRoleHint("Dtos")).toBe("dtos");
    expect(inferRoleHint("Services")).toBe("services");
    expect(inferRoleHint("Repositories")).toBe("repositories");
    expect(inferRoleHint("Middleware")).toBe("middleware");
    expect(inferRoleHint("Filters")).toBe("middleware");
    expect(inferRoleHint("Extensions")).toBe("utils");
    expect(inferRoleHint("Validators")).toBe("utils");
  });

  it("knows the Python conventions", () => {
    expect(inferRoleHint("app/api/routes")).toBe("routes");
    expect(inferRoleHint("app/urls")).toBe("routes");
    expect(inferRoleHint("app/schemas")).toBe("dtos");
    expect(inferRoleHint("app/serializers")).toBe("dtos");
    expect(inferRoleHint("app/forms")).toBe("dtos");
    expect(inferRoleHint("app/viewsets")).toBe("controllers");
    expect(inferRoleHint("app/repositories")).toBe("repositories");
    expect(inferRoleHint("app/tasks")).toBe("jobs");
  });

  it("knows the Go conventions", () => {
    expect(inferRoleHint("internal/handlers")).toBe("controllers");
    expect(inferRoleHint("internal/repository")).toBe("repositories");
    expect(inferRoleHint("internal/service")).toBe("services");
    expect(inferRoleHint("internal/router")).toBe("routes");
    expect(inferRoleHint("internal/middleware")).toBe("middleware");
    expect(inferRoleHint("internal/config")).toBe("config");
  });

  it("knows the Java and Kotlin conventions", () => {
    expect(inferRoleHint("com/acme/controller")).toBe("controllers");
    expect(inferRoleHint("com/acme/repository")).toBe("repositories");
    expect(inferRoleHint("com/acme/entity")).toBe("entities");
    expect(inferRoleHint("com/acme/mapper")).toBe("utils");
    expect(inferRoleHint("com/acme/exception")).toBe("utils");
    expect(inferRoleHint("com/acme/interceptor")).toBe("middleware");
    expect(inferRoleHint("com/acme/configuration")).toBe("config");
  });

  it("knows the Laravel conventions", () => {
    expect(inferRoleHint("app/Http/Controllers")).toBe("controllers");
    expect(inferRoleHint("app/Http/Middleware")).toBe("middleware");
    expect(inferRoleHint("app/Http/Requests")).toBe("dtos");
    expect(inferRoleHint("app/Models")).toBe("models");
    expect(inferRoleHint("app/Providers")).toBe("services");
    expect(inferRoleHint("app/Policies")).toBe("services");
    expect(inferRoleHint("app/Jobs")).toBe("jobs");
    expect(inferRoleHint("app/Listeners")).toBe("jobs");
    expect(inferRoleHint("app/Observers")).toBe("jobs");
    expect(inferRoleHint("app/Rules")).toBe("utils");
  });

  it("knows the Rails conventions", () => {
    expect(inferRoleHint("app/controllers")).toBe("controllers");
    expect(inferRoleHint("app/models")).toBe("models");
    expect(inferRoleHint("app/helpers")).toBe("utils");
    expect(inferRoleHint("app/serializers")).toBe("dtos");
    expect(inferRoleHint("app/mailers")).toBe("jobs");
    expect(inferRoleHint("app/channels")).toBeNull();
    expect(inferRoleHint("spec")).toBe("tests");
  });

  /** Decided deliberately: a wrong hint tells the model something false. */
  it("leaves a name that means two different things unmapped", () => {
    expect(roles(["resources", "Resources"])).toEqual([null, null]);
    expect(roles(["views", "Views"])).toEqual([null, null]);
    expect(roles(["store", "stores"])).toEqual([null, null]);
    expect(roles(["data", "Data"])).toEqual([null, null]);
  });

  it("gives an unknown name no role", () => {
    expect(inferRoleHint("internal")).toBeNull();
    expect(inferRoleHint("pkg")).toBeNull();
    expect(inferRoleHint("cmd/api")).toBeNull();
    expect(inferRoleHint("src")).toBeNull();
  });
});
