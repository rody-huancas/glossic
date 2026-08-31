import express from "express";

import { errorHandler } from "./src/middleware/error-handler.js";
import { healthRoutes } from "./src/routes/health.routes.js";
import { usersRoutes } from "./src/routes/users.routes.js";

const app = express();

app.use(express.json());
app.use("/health", healthRoutes);
app.use("/users", usersRoutes);
app.use(errorHandler);

app.listen(process.env.PORT ?? 3000);
