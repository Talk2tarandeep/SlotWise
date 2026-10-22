// Floor overlay: every walkable cell tinted by how often the picker stepped
// on it while replaying all orders on the active layout. One draw call.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D } from 'three';
import type { Grid } from '../sim/grid';
import type { Heatmap } from '../sim/heatmap';
import { toWorld, trafficColor } from './helpers';

export function TrafficHeatmap({ grid, heat, scaleMax }: { grid: Grid; heat: Heatmap; scaleMax: number }) {
  const meshRef = useRef<InstancedMesh>(null);

  // Walkable cell indices (rack cells never get traffic).
  const cells = useMemo(() => grid.walkable.flatMap((ok, i) => (ok ? [i] : [])), [grid]);

  useLayoutEffect(() => {
    const mesh = meshRef.current!;
    const dummy = new Object3D();
    cells.forEach((cell, i) => {
      const [x, z] = toWorld(grid, cell % grid.width, Math.floor(cell / grid.width));
      dummy.position.set(x, 0.015, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, trafficColor(heat.cellPasses[cell], scaleMax));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, grid, heat, scaleMax]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]} raycast={() => null}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial transparent opacity={0.85} />
    </instancedMesh>
  );
}
