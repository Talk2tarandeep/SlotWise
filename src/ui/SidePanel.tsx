// Right-hand panel: a header and four tabs.
//   Dashboard - scenario, live KPIs, selected picker, events, whole-month results
//   Optimize  - layout optimizer, held-out before/after, SKU moves, policies
//   Game      - swap game, points, active orders, challenges, leaderboard
//   What-if   - build and compare scenarios

import { useStore, type PanelTab } from '../store';
import { Dashboard } from './Dashboard';
import { GamePanel } from './GamePanel';
import { OptimizePanel } from './OptimizePanel';
import { WhatIf } from './WhatIf';

const TABS: [PanelTab, string][] = [
  ['dashboard', 'Dashboard'],
  ['optimize', 'Optimize'],
  ['game', 'Game'],
  ['whatif', 'What-if'],
];

export function SidePanel() {
  const data = useStore((s) => s.data)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const optimizerRunning = useStore((s) => s.optimizer.status === 'running');

  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>Picking Floor Twin</h1>
        <p className="muted">
          {data.month} · {data.orders.length.toLocaleString()} real orders · {data.products.length} products · 120 slots
        </p>
        <nav className="tabs" role="tablist">
          {TABS.map(([key, name]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {name}
              {key === 'optimize' && optimizerRunning && <span className="busy-dot" title="Optimizer running" />}
            </button>
          ))}
        </nav>
      </header>
      <div className="panel-body">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'optimize' && <OptimizePanel />}
        {tab === 'game' && <GamePanel />}
        {tab === 'whatif' && <WhatIf />}
      </div>
    </aside>
  );
}
