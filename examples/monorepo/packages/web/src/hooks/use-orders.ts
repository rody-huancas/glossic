import { useEffect, useState } from "react";

type Order = { id: string; total: number };

export const useOrders = (): Order[] => {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch("/orders")
      .then((response) => response.json())
      .then(setOrders);
  }, []);

  return orders;
};
