// Live congestion heatmap on the floor during the replay.
// Every cell a picker has walked so far is tinted by how long pickers had to
// WAIT there (blocked by another picker): green = flowing, yellow = some
// waiting, red = heavy waiting (thresholds in helpers.ts, shown in the legend).
// It grows as the replay plays and rewinds with the scrubber.

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D } from 'three';
import { replayClock } from '../replay/clock';
import { STATUS, type MultiPickerResult } from '../sim/congestion';
import type { Grid } from '../sim/grid';
import { congestionColor, toWorld } from './helpers';

const REFRESH_S = 0.25; // recolour 4x per second

export function CongestionOverlay({ grid, sim }: { grid: Grid; sim: MultiPickerResult }) {
  const meshRef = useRef<InstancedMesh>(null);
  const since = useRef(REFRESH_S);
  const lastTick = useRef(-1);
  const cells = useMemo(() => grid.walkable.flatMap((ok, i) => (ok ? [i] : [])), [grid]);
  const slotOfCell = useMemo(() => new Map(cells.map((c, i) => [c, i])), [cells]);

  useLayoutEffect(() => {
    lastTick.current = -1; // force a refresh for a new recording
  }, [sim]);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current < REFRESH_S) return;
    since.current = 0;
    const tick = Math.min(Math.floor(replayClock.seconds / sim.tickS), sim.ticks);
    if (tick === lastTick.current) return;
    lastTick.current = tick;

    // Count visits and waiting ticks per cell up to now.
    const visited = new Uint8Array(cells.length);
    const waitTicks = new Float32Array(cells.length);
    sim.frames!.forEach((f, p) => {
      const st = sim.status![p];
      for (let t = 0; t <= tick; t++) {
        const k = slotOfCell.get(f[t]);
        if (k === undefined) continue;
        visited[k] = 1;
        if (t < tick && st[t] === STATUS.waiting) waitTicks[k]++;
      }
    });

    const mesh = meshRef.current!;
    const d = new Object3D();
    cells.forEach((cell, k) => {
      const [x, z] = toWorld(grid, cell % grid.width, Math.floor(cell / grid.width));
      d.position.set(x, 0.012, z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(visited[k] ? 1 : 0); // unvisited cells stay hidden
      d.updateMatrix();
      mesh.setMatrixAt(k, d.matrix);
      mesh.setColorAt(k, congestionColor(waitTicks[k] * sim.tickS));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]} raycast={() => null}>
      <planeGeometry args={[0.94, 0.94]} />
      <meshBasicMaterial transparent opacity={0.6} />
    </instancedMesh>
  );
}
