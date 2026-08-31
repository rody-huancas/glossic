import { useOrders } from "../hooks/use-orders.js";

export const OrderList = () => {
  const orders = useOrders();

  return (
    <ul>
      {orders.map((order) => (
        <li key={order.id}>{order.total}</li>
      ))}
    </ul>
  );
};
