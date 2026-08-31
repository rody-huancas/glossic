import { Router } from "express";

import { createUser, listUsers } from "../controllers/users.controller.js";

export const usersRoutes = Router();

usersRoutes.get("/", listUsers);
usersRoutes.post("/", createUser);
