import { createRoot } from "react-dom/client";

import { OrderList } from "./components/OrderList.js";

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(<OrderList />);
}
