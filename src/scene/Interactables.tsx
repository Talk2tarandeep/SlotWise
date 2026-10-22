// Invisible click targets for whole aisles, so you can inspect an aisle
// (occupancy, picks, waiting) by clicking its floor. Racks, pickers and the
// dock have their own click handlers.

import type { ThreeEvent } from '@react-three/fiber';
import type { Grid } from '../sim/grid';
import { useStore } from '../store';
import { toWorld } from './helpers';

export function AisleHitAreas({ grid }: { grid: Grid }) {
  const cfg = grid.config;
  const setInspect = useStore((s) => s.setInspect);
  const inspect = useStore((s) => s.inspect);
  const block = 2 * cfg.rackDepth + cfg.aisleWidth;

  return (
    <group>
      {Array.from({ length: cfg.aisles }, (_, a) => {
        const [x, z] = toWorld(grid, a * block + cfg.rackDepth + (cfg.aisleWidth - 1) / 2, cfg.crossAisleWidth + (cfg.slotsPerFace - 1) / 2);
        const selected = inspect?.kind === 'aisle' && inspect.id === a;
        return (
          <mesh
            key={a}
            rotation-x={-Math.PI / 2}
            position={[x, 0.008, z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 4) return; // a camera drag, not a click
              e.stopPropagation();
              setInspect({ kind: 'aisle', id: a });
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <planeGeometry args={[cfg.aisleWidth - 0.3, cfg.slotsPerFace]} />
            {/* Invisible unless selected (then a faint blue wash) */}
            <meshBasicMaterial color="#2563eb" transparent opacity={selected ? 0.12 : 0} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
