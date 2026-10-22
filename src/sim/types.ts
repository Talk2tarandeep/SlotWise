// Shape of public/data/warehouse.json (written by preprocess/build_data.py).

export type Product = {
  code: string; // StockCode, e.g. "85123A"
  desc: string; // short description
  picks: number; // number of order lines in the month
  rank: number; // 1 = most picked
};

export type Order = {
  id: string; // invoice number
  t: string; // timestamp "YYYY-MM-DDTHH:MM"
  items: string[]; // product codes (one per order line)
};

export type WarehouseData = {
  month: string;
  products: Product[];
  orders: Order[];
  summary: Record<string, unknown>;
};
