import { logger } from "../utils/logger.js";

const users = new Map();

export function listUsers(_req, res) {
  res.json([...users.values()]);
}

export function createUser(req, res) {
  const user = { id: crypto.randomUUID(), ...req.body };
  users.set(user.id, user);
  logger.info("user created", user.id);
  res.status(201).json(user);
}
