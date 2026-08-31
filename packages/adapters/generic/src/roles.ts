import type { RoleHint } from "@glossic/schema";

/** Directory name (lowercased) -> role. Singular and plural both map. */
const ROLE_BY_DIRECTORY: Readonly<Record<string, RoleHint>> = {
  __tests__: "tests",
  component: "components",
  components: "components",
  config: "config",
  configs: "config",
  configuration: "config",
  controller: "controllers",
  controllers: "controllers",
  dto: "dtos",
  dtos: "dtos",
  e2e: "tests",
  entities: "entities",
  entity: "entities",
  helper: "utils",
  helpers: "utils",
  hook: "hooks",
  hooks: "hooks",
  middleware: "middleware",
  middlewares: "middleware",
  model: "models",
  models: "models",
  route: "routes",
  router: "routes",
  routers: "routes",
  routes: "routes",
  service: "services",
  services: "services",
  spec: "tests",
  specs: "tests",
  test: "tests",
  tests: "tests",
  util: "utils",
  utils: "utils",
  utilities: "utils",
};

/**
 * Guesses a role from the directory name alone. The project root never gets a
 * hint: its name says something about the repository, not about the code.
 */
export const inferRoleHint = (unitName: string): RoleHint | null => {
  if (unitName === "root") return null;
  const base = unitName.slice(unitName.lastIndexOf("/") + 1).toLowerCase();
  return ROLE_BY_DIRECTORY[base] ?? null;
};
