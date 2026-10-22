import { useEffect, useState } from 'react';
import { WarehouseScene } from './scene/WarehouseScene';
import type { WarehouseData } from './sim/types';
import { useStore } from './store';
import { SidePanel } from './ui/SidePanel';

// Loads warehouse.json once, builds the sim model, then shows scene + panel.
export default function App() {
  const ready = useStore((s) => s.model !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/warehouse.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: WarehouseData) => useStore.getState().init(data))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="loading">Could not load data: {error}. Run the preprocessing step first.</div>;
  if (!ready) return <div className="loading">Loading warehouse data…</div>;

  return (
    <div className="app">
      <div className="scene">
        <WarehouseScene />
      </div>
      <SidePanel />
    </div>
  );
}
