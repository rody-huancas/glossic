import { logger } from "../utils/logger.js";

export function errorHandler(err, _req, res, _next) {
  logger.error(err.message);
  res.status(err.status ?? 500).json({ error: err.message });
}
