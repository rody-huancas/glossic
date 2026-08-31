import { listOrders } from "../services/orders.service.js";

export const orderRoutes = [{ method: "GET", path: "/orders", handler: listOrders }];
