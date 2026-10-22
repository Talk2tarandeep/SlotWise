// Floor, aisle lanes, cross-aisles and the packing dock.

import { Html } from '@react-three/drei';
import type { Grid } from '../sim/grid';
import { toWorld } from './helpers';

export function Floor({ grid }: { grid: Grid }) {
  const cfg = grid.config;
  const blockWidth = 2 * cfg.rackDepth + cfg.aisleWidth;
  const [dockX, dockZ] = toWorld(grid, cfg.dock.x, cfg.dock.y);

  return (
    <group>
      {/* Concrete floor slab, a little larger than the grid */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 1]} receiveShadow>
        <planeGeometry args={[grid.width + 4, grid.height + 6]} />
        <meshStandardMaterial color="#141a24" />
      </mesh>

      {/* Walkable area outline */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[grid.width, grid.height]} />
        <meshStandardMaterial color="#1b2330" />
      </mesh>

      {/* Aisle lanes (between racks) */}
      {Array.from({ length: cfg.aisles }, (_, a) => {
        const [x, z] = toWorld(grid, a * blockWidth + cfg.rackDepth + (cfg.aisleWidth - 1) / 2, cfg.crossAisleWidth + (cfg.slotsPerFace - 1) / 2);
        return (
          <mesh key={a} rotation-x={-Math.PI / 2} position={[x, 0.002, z]}>
            <planeGeometry args={[cfg.aisleWidth - 0.4, cfg.slotsPerFace]} />
            <meshStandardMaterial color="#222c3b" />
          </mesh>
        );
      })}

      {/* Front and back cross-aisle edge lines */}
      {[cfg.crossAisleWidth - 0.5, cfg.crossAisleWidth + cfg.slotsPerFace - 0.5].map((y) => (
        <mesh key={y} rotation-x={-Math.PI / 2} position={[0, 0.003, toWorld(grid, 0, y)[1]]}>
          <planeGeometry args={[grid.width, 0.05]} />
          <meshBasicMaterial color="#e3b341" transparent opacity={0.35} />
        </mesh>
      ))}

      {/* Packing dock: yellow pad + table just outside the front edge */}
      <mesh rotation-x={-Math.PI / 2} position={[dockX + 0.5, 0.004, dockZ - 0.5]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshStandardMaterial color="#e3b341" transparent opacity={0.25} />
      </mesh>
      <mesh position={[dockX + 0.5, 0.45, dockZ + 1.1]} castShadow>
        <boxGeometry args={[2.4, 0.9, 0.8]} />
        <meshStandardMaterial color="#e3b341" />
      </mesh>
      <Html position={[dockX + 0.5, 1.4, dockZ + 1.1]} center className="label">
        PACKING DOCK
      </Html>
    </group>
  );
}
