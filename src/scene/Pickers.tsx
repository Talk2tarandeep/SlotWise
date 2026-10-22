// The pickers in the 3D replay (any number), driven by a recorded simulation.
//
// Every frame: advance the replay clock, then place each picker at its
// recorded cell (interpolated between ticks so movement is smooth).
// Also drawn, per picker:
//   - a fading trail of the cells it actually walked (solid dots),
//   - its planned remaining route for the current trip (dashed line),
//   - a marker on its next stop (pulsing for the selected picker).
// Pickers never re-route in this simulation, so "planned" = the recorded
// future path of the trip; waiting shows up as time spent standing still.

import { Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, Group, InstancedMesh, Mesh, Object3D } from 'three';
import { replayClock } from '../replay/clock';
import type { MultiPickerResult } from '../sim/congestion';
import type { WarehouseModel } from '../sim/model';
import { useStore } from '../store';
import { cellToWorld, pickerColor, toWorld } from './helpers';
import { HumanPicker } from './HumanPicker';

const UI_UPDATE_S = 0.1; // push the tick to the UI 10x per second (not every frame)
const TRAIL_LEN = 36; // dots per picker trail

// World positions of the pickers, read by the camera "follow" preset.
export const pickerWorld: { x: number; z: number }[] = [];

export function Pickers({ model, sim }: { model: WarehouseModel; sim: MultiPickerResult }) {
  const grid = model.grid;
  const groups = useRef<(Group | null)[]>([]);
  const trailRef = useRef<InstancedMesh>(null);
  const markerRefs = useRef<(Mesh | null)[]>([]);
  const sinceUpdate = useRef(0);
  const inspect = useStore((s) => s.inspect);
  const selectedPicker = inspect?.kind === 'picker' ? inspect.id : null;
  const setInspect = useStore((s) => s.setInspect);
  const frames = sim.frames!;
  const duration = sim.ticks * sim.tickS;

  // Planned routes / next stops change only a few times per trip: kept in state, refreshed at 10 Hz.
  const [plans, setPlans] = useState<{ key: string; points: [number, number, number][]; next: [number, number] | null }[]>([]);

  // Keep the clock inside the new recording when settings change.
  useEffect(() => {
    replayClock.seconds = Math.min(replayClock.seconds, duration);
  }, [duration]);

  // Trail dot colours: one block of TRAIL_LEN instances per picker.
  useLayoutEffect(() => {
    const mesh = trailRef.current!;
    for (let p = 0; p < frames.length; p++) {
      const c = new Color(pickerColor(p));
      for (let k = 0; k < TRAIL_LEN; k++) mesh.setColorAt(p * TRAIL_LEN + k, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [frames.length]);

  const dummy = useMemo(() => new Object3D(), []);

  useFrame((state, delta) => {
    const { playing, speed, setPlaying, setTick } = useStore.getState();
    if (playing) replayClock.seconds = Math.min(duration, replayClock.seconds + delta * speed);
    const t = replayClock.seconds / sim.tickS;
    const i = Math.min(Math.floor(t), sim.ticks);
    const j = Math.min(i + 1, sim.ticks);
    const f = t - i;

    // 1. Picker positions.
    frames.forEach((cells, p) => {
      const [ax, az] = cellToWorld(grid, cells[i]);
      const [bx, bz] = cellToWorld(grid, cells[j]);
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      groups.current[p]?.position.set(x, 0, z);
      pickerWorld[p] = { x, z };
    });

    // 2. Trails: the last TRAIL_LEN distinct cells each picker walked (newest = biggest dot).
    const trail = trailRef.current!;
    frames.forEach((cells, p) => {
      let k = 0;
      let last = -1;
      for (let tk = i; tk >= 0 && k < TRAIL_LEN; tk--) {
        if (cells[tk] === last) continue;
        last = cells[tk];
        const [x, z] = cellToWorld(grid, cells[tk]);
        const s = k === 0 ? 0 : 1 - k / TRAIL_LEN; // skip the cell under the picker
        dummy.position.set(x, 0.03, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        trail.setMatrixAt(p * TRAIL_LEN + k, dummy.matrix);
        k++;
      }
      for (; k < TRAIL_LEN; k++) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        trail.setMatrixAt(p * TRAIL_LEN + k, dummy.matrix);
      }
    });
    trail.instanceMatrix.needsUpdate = true;

    // 3. Pulse the selected picker's next-stop marker.
    const pulse = 1 + 0.25 * Math.sin(state.clock.elapsedTime * 6);
    const ins = useStore.getState().inspect;
    const sel = ins?.kind === 'picker' ? ins.id : -1;
    markerRefs.current.forEach((m, p) => m?.scale.setScalar(p === sel ? pulse : 1));

    // 4. Tell the UI (throttled) and refresh planned routes.
    sinceUpdate.current += delta;
    const finished = playing && replayClock.seconds >= duration;
    if (sinceUpdate.current >= UI_UPDATE_S || finished) {
      sinceUpdate.current = 0;
      setTick(i);
      setPlans((prev) => {
        const next = frames.map((cells, p) => {
          const tripIdx = sim.tripAt![p][i];
          const trip = tripIdx >= 0 ? sim.trips![tripIdx] : null;
          // Re-plan only when the picker moved to a new cell (cheap key check).
          const key = `${tripIdx}:${cells[i]}`;
          if (prev[p]?.key === key) return prev[p];
          if (!trip) return { key, points: [], next: null };
          const end = trip.endTick >= 0 ? trip.endTick : sim.ticks;
          const points: [number, number, number][] = [];
          let lastCell = -1;
          for (let tk = i; tk <= end; tk++) {
            if (cells[tk] === lastCell) continue;
            lastCell = cells[tk];
            const [x, z] = cellToWorld(grid, cells[tk]);
            points.push([x, 0.05, z]);
          }
          // Next stop = first future stop not yet reached.
          const s = trip.arriveTicks.findIndex((a, idx) => idx > 0 && (a === undefined || a > i));
          const node = s > 0 ? trip.stops[s] : null;
          return { key, points, next: node !== null ? toWorld(grid, grid.nodes[node].x, grid.nodes[node].y) : null };
        });
        return next.every((n, p) => n === prev[p]) && prev.length === next.length ? prev : next;
      });
    }
    if (finished) setPlaying(false);
  });

  const select = (p: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setInspect({ kind: 'picker', id: p });
  };

  return (
    <group>
      {/* Actual path: fading dots behind each picker */}
      <instancedMesh ref={trailRef} args={[undefined, undefined, frames.length * TRAIL_LEN]} raycast={() => null}>
        <circleGeometry args={[0.13, 10]} />
        <meshBasicMaterial transparent opacity={0.8} />
      </instancedMesh>

      {plans.map((plan, p) => (
        <group key={p}>
          {/* Planned remaining route of the current trip */}
          {plan.points.length > 1 && (
            <Line
              points={plan.points}
              color={pickerColor(p)}
              lineWidth={selectedPicker === null || selectedPicker === p ? 2 : 1}
              dashed
              dashSize={0.35}
              gapSize={0.25}
              transparent
              opacity={selectedPicker === null || selectedPicker === p ? 0.8 : 0.3}
            />
          )}
          {/* Next stop marker */}
          {plan.next && (
            <mesh ref={(m) => (markerRefs.current[p] = m)} rotation-x={-Math.PI / 2} position={[plan.next[0], 0.04, plan.next[1]]} raycast={() => null}>
              <ringGeometry args={[0.3, 0.45, 28]} />
              <meshBasicMaterial color={pickerColor(p)} transparent opacity={0.9} />
            </mesh>
          )}
        </group>
      ))}

      {frames.map((_, p) => (
        <group
          key={p}
          ref={(g) => (groups.current[p] = g)}
          onClick={select(p)}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          {/* Simple capsule while the worker model downloads */}
          <Suspense
            fallback={
              <mesh position={[0, 0.85, 0]} castShadow>
                <capsuleGeometry args={[0.28, 0.9, 4, 12]} />
                <meshStandardMaterial color={pickerColor(p)} />
              </mesh>
            }
          >
            <HumanPicker color={pickerColor(p)} />
          </Suspense>
          {/* Coloured disc under the picker (bigger when selected) + an easy click target */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} scale={selectedPicker === p ? 1.5 : 1}>
            <circleGeometry args={[0.5, 24]} />
            <meshBasicMaterial color={pickerColor(p)} transparent opacity={selectedPicker === p ? 0.7 : 0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
