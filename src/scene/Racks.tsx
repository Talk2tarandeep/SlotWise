// Racks (simple frames) and one instanced box per slot, coloured by heat.
// 120 slots = one draw call thanks to instancing.

import { Html } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Object3D } from 'three';
import type { Grid } from '../sim/grid';
import type { Layout } from '../sim/layouts';
import type { Product } from '../sim/types';
import { useStore } from '../store';
import { heatColor, toWorld } from './helpers';

const BOX_SIZE = 0.8;
const BOX_Y = 0.5; // centre height of a product box (sits on the bottom shelf)
const EMPTY_COLOR = new Color('#2a3342');

type Props = { grid: Grid; layout: Layout; products: Product[] };

export function Racks({ grid, layout, products }: Props) {
  const meshRef = useRef<InstancedMesh>(null);
  const setHovered = useStore((s) => s.setHovered);
  const hovered = useStore((s) => s.hovered);

  const productByCode = useMemo(() => new Map(products.map((p) => [p.code, p])), [products]);
  const [minPicks, maxPicks] = useMemo(() => {
    const picks = products.map((p) => p.picks);
    return [Math.min(...picks), Math.max(...picks)];
  }, [products]);

  // Place each slot box once.
  useLayoutEffect(() => {
    const mesh = meshRef.current!;
    const dummy = new Object3D();
    grid.slots.forEach((slot) => {
      const [x, z] = toWorld(grid, slot.rackCell.x, slot.rackCell.y);
      dummy.position.set(x, BOX_Y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot.id, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [grid]);

  // Recolour whenever the layout changes (or the hovered slot changes).
  useLayoutEffect(() => {
    const mesh = meshRef.current!;
    grid.slots.forEach((slot) => {
      const product = layout[slot.id] ? productByCode.get(layout[slot.id]!) : undefined;
      const color = product ? heatColor(product.picks, minPicks, maxPicks) : EMPTY_COLOR.clone();
      if (slot.id === hovered) color.offsetHSL(0, 0, 0.25);
      mesh.setColorAt(slot.id, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [grid, layout, productByCode, minPicks, maxPicks, hovered]);

  const hoveredSlot = hovered !== null ? grid.slots[hovered] : null;
  const hoveredProduct = hoveredSlot && layout[hoveredSlot.id] ? productByCode.get(layout[hoveredSlot.id]!) : undefined;
  const [tipX, tipZ] = hoveredSlot ? toWorld(grid, hoveredSlot.rackCell.x, hoveredSlot.rackCell.y) : [0, 0];

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, grid.slots.length]}
        castShadow
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) setHovered(e.instanceId);
        }}
        onPointerOut={() => setHovered(null)}
      >
        <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
        <meshStandardMaterial />
      </instancedMesh>

      <RackFrames grid={grid} />

      {hoveredSlot && (
        <Html
          position={[tipX, 1.6, tipZ]}
          center
          className="tooltip"
          style={{ pointerEvents: 'none' }}
        >
          <div className="tooltip-title">
            Slot A{hoveredSlot.aisle + 1}-{hoveredSlot.side}
            {hoveredSlot.pos + 1}
          </div>
          {hoveredProduct ? (
            <>
              <div>
                <b>{hoveredProduct.code}</b> {hoveredProduct.desc}
              </div>
              <div>
                {hoveredProduct.picks} picks · rank #{hoveredProduct.rank}
              </div>
            </>
          ) : (
            <div>Empty slot</div>
          )}
        </Html>
      )}
    </group>
  );
}

// Bottom and top shelf plank + end posts for every rack face.
function RackFrames({ grid }: { grid: Grid }) {
  const cfg = grid.config;
  const faces = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let a = 0; a < cfg.aisles; a++) {
      for (const side of ['L', 'R'] as const) {
        const first = grid.slots.find((s) => s.aisle === a && s.side === side)!;
        const [x, z] = toWorld(grid, first.rackCell.x, first.rackCell.y + (cfg.slotsPerFace - 1) / 2);
        out.push({ x, z });
      }
    }
    return out;
  }, [grid, cfg]);

  const len = cfg.slotsPerFace;
  return (
    <group>
      {faces.map(({ x, z }, i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.95, 0.1, len]} />
            <meshStandardMaterial color="#3a4556" />
          </mesh>
          {/* Thin top rails (not a solid shelf) so the products stay visible from above */}
          {[-0.44, 0.44].map((dx) => (
            <mesh key={dx} position={[dx, 1.15, 0]}>
              <boxGeometry args={[0.06, 0.06, len]} />
              <meshStandardMaterial color="#56647a" />
            </mesh>
          ))}
          {[-len / 2, 0, len / 2].map((dz) => (
            <mesh key={dz} position={[0, 0.6, dz]}>
              <boxGeometry args={[0.08, 1.2, 0.08]} />
              <meshStandardMaterial color="#56647a" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
