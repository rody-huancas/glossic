import { registerRoutes } from "./routes/index.js";

export const createServer = () => {
  const routes = registerRoutes();
  return { routes };
};
