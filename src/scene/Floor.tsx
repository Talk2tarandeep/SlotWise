// Floor: polished concrete with a faint 1 m grid, yellow safety lines along
// every aisle edge, and a hatched yellow/black safety zone at the dock.

import { Html } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Grid } from '../sim/grid';
import { toWorld } from './helpers';
import { SCENE } from './theme';

// Floor slab extends this far past the walkable grid (room for walls and the dock).
export const SLAB_MARGIN_X = 2;
export const SLAB_MARGIN_BACK = 2;
export const SLAB_MARGIN_FRONT = 4;

// Small textures drawn in code (no image downloads).
function makeGridTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = SCENE.concrete;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = SCENE.concreteGrid;
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64); // one tile = one 1 m cell
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Pale yellow area with a hatched yellow/black border.
function makeHazardTexture(widthM: number, depthM: number): CanvasTexture {
  const px = 64; // pixels per metre
  const c = document.createElement('canvas');
  c.width = widthM * px;
  c.height = depthM * px;
  const g = c.getContext('2d')!;
  const band = 0.3 * px;
  // stripes everywhere first...
  g.fillStyle = SCENE.safetyYellow;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = SCENE.hazardBlack;
  g.lineWidth = 10;
  for (let x = -c.height; x < c.width; x += 28) {
    g.beginPath();
    g.moveTo(x, c.height);
    g.lineTo(x + c.height, 0);
    g.stroke();
  }
  // ...then a pale interior on top, leaving a hatched band around the edge.
  g.fillStyle = '#f6efc9';
  g.fillRect(band, band, c.width - 2 * band, c.height - 2 * band);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function Floor({ grid }: { grid: Grid }) {
  const cfg = grid.config;
  const blockWidth = 2 * cfg.rackDepth + cfg.aisleWidth;
  const slabW = grid.width + 2 * SLAB_MARGIN_X;
  const slabD = grid.height + SLAB_MARGIN_BACK + SLAB_MARGIN_FRONT;
  const slabZ = (SLAB_MARGIN_FRONT - SLAB_MARGIN_BACK) / 2; // slab centre (front margin is bigger)

  const gridTex = useMemo(() => {
    const t = makeGridTexture();
    t.repeat.set(slabW, slabD);
    t.offset.set(0, 0);
    return t;
  }, [slabW, slabD]);

  // Dock safety zone around the dock cell and the table in front of it.
  const [dockX, dockZ] = toWorld(grid, cfg.dock.x, cfg.dock.y);
  const zoneW = 4;
  const zoneD = 3.5;
  const hazardTex = useMemo(() => makeHazardTexture(zoneW, zoneD), []);

  // Yellow lines on both edges of every aisle (12 thin strips, one draw call).
  const linesRef = useRef<InstancedMesh>(null);
  const lineX = useMemo(() => {
    const xs: number[] = [];
    for (let a = 0; a < cfg.aisles; a++) {
      const x0 = a * blockWidth;
      const leftEdge = x0 + cfg.rackDepth - grid.width / 2; // where the left rack meets the aisle
      const rightEdge = x0 + cfg.rackDepth + cfg.aisleWidth - grid.width / 2;
      xs.push(leftEdge + 0.12, rightEdge - 0.12);
    }
    return xs;
  }, [cfg, blockWidth, grid.width]);
  const rackFrontZ = grid.height / 2 - cfg.crossAisleWidth;
  const rackMidZ = rackFrontZ - cfg.slotsPerFace / 2;

  useLayoutEffect(() => {
    const mesh = linesRef.current!;
    const d = new Object3D();
    lineX.forEach((x, i) => {
      d.position.set(x, 0.004, rackMidZ);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [lineX, rackMidZ]);

  return (
    <group>
      {/* Concrete slab with a faint 1 m grid */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, slabZ]} receiveShadow>
        <planeGeometry args={[slabW, slabD]} />
        <meshStandardMaterial map={gridTex} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Yellow safety lines along aisle edges */}
      <instancedMesh ref={linesRef} args={[undefined, undefined, lineX.length]} raycast={() => null}>
        <planeGeometry args={[0.08, cfg.slotsPerFace + 0.6]} />
        <meshBasicMaterial color={SCENE.safetyYellow} />
      </instancedMesh>

      {/* Hatched safety zone around the packing dock */}
      <mesh rotation-x={-Math.PI / 2} position={[dockX + 1.2, 0.005, dockZ + 0.9]} receiveShadow raycast={() => null}>
        <planeGeometry args={[zoneW, zoneD]} />
        <meshStandardMaterial map={hazardTex} roughness={0.7} />
      </mesh>

      {/* Packing table (replaced by a full workstation in a later step) */}
      <mesh position={[dockX + 0.5, 0.45, dockZ + 1.3]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.9, 0.8]} />
        <meshStandardMaterial color="#b08a5a" roughness={0.8} />
      </mesh>
      <Html position={[dockX + 0.5, 1.4, dockZ + 1.3]} center className="label">
        PACKING DOCK
      </Html>
    </group>
  );
}
