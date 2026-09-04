import type { RoleHint } from "@glossic/schema";

import { ROLE_BY_DIRECTORY } from "./table.js";

export const inferRoleHint = (unitName: string): RoleHint | null => {
  if (unitName === "root") {
    return null;
  }

  const base = unitName.slice(unitName.lastIndexOf("/") + 1).toLowerCase();

  return ROLE_BY_DIRECTORY[base] ?? null;
};
