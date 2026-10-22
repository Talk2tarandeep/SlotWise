// Several pickers replayed from a recorded congestion simulation.
// Each frame of the recording is one tick (time to walk 1 m); we interpolate
// between ticks so the movement looks smooth.

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { TICK_S, type MultiPickerResult } from '../sim/congestion';
import type { Grid } from '../sim/grid';
import { useStore } from '../store';
import { toWorld } from './helpers';

export const PICKER_COLORS = ['#4cc9f0', '#f72585', '#b5e48c', '#ffb703'];
const COUNTER_UPDATE_S = 0.1;

export function MultiPickers({ grid, sim }: { grid: Grid; sim: MultiPickerResult }) {
  const refs = useRef<(Group | null)[]>([]);
  const clock = useRef(0);
  const sinceUpdate = useRef(0);
  const replayId = useStore((s) => s.replayId);
  const setLive = useStore((s) => s.setLive);
  const frames = sim.frames!;
  const duration = sim.ticks * TICK_S;

  useEffect(() => {
    clock.current = 0;
  }, [replayId, sim]);

  useFrame((_, delta) => {
    const { playing, speed, setPlaying } = useStore.getState();
    if (playing) clock.current = Math.min(duration, clock.current + delta * speed);

    const t = clock.current / TICK_S;
    const i = Math.min(Math.floor(t), sim.ticks);
    const j = Math.min(i + 1, sim.ticks);
    const f = t - i;
    frames.forEach((cells, p) => {
      const a = cells[i];
      const b = cells[j];
      const x = (a % grid.width) * (1 - f) + (b % grid.width) * f;
      const y = Math.floor(a / grid.width) * (1 - f) + Math.floor(b / grid.width) * f;
      const [wx, wz] = toWorld(grid, x, y);
      refs.current[p]?.position.set(wx, 0, wz);
    });

    sinceUpdate.current += delta;
    const finished = playing && clock.current >= duration;
    if (sinceUpdate.current >= COUNTER_UPDATE_S || finished) {
      sinceUpdate.current = 0;
      setLive({
        distance: sim.distanceByTick![i],
        elapsed: clock.current,
        ordersDone: sim.ordersDoneByTick![i],
        tripIdx: 0,
        waitS: sim.waitByTick![i] * TICK_S,
      });
    }
    if (finished) setPlaying(false);
  });

  return (
    <group>
      {frames.map((_, p) => (
        <group key={p} ref={(g) => (refs.current[p] = g)}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <capsuleGeometry args={[0.28, 0.9, 4, 12]} />
            <meshStandardMaterial color="#f8f9fa" emissive={PICKER_COLORS[p % PICKER_COLORS.length]} emissiveIntensity={0.6} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
            <circleGeometry args={[0.45, 24]} />
            <meshBasicMaterial color={PICKER_COLORS[p % PICKER_COLORS.length]} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
