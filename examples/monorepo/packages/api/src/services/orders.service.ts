export interface Order {
  id: string;
  total: number;
}

const orders: Order[] = [];

export const listOrders = async (): Promise<Order[]> => orders;
