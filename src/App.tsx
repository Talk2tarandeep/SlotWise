import { useEffect, useState } from 'react';

// Phase 1 stub: loads warehouse.json and shows the data summary.
// The 3D scene and game UI arrive in later phases.
type WarehouseData = {
  month: string;
  products: { code: string; desc: string; picks: number; rank: number }[];
  orders: { id: string; t: string; items: string[] }[];
};

export default function App() {
  const [data, setData] = useState<WarehouseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/warehouse.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="stub">
      <h1>Warehouse Digital Twin</h1>
      {error && <p>Could not load data: {error}. Run the preprocessing step first.</p>}
      {data && (
        <p>
          {data.month}: {data.products.length} products, {data.orders.length} orders loaded.
        </p>
      )}
    </main>
  );
}
