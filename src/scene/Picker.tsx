// The animated picker (a capsule) plus the route of the order in progress.
//
// A simulation clock advances by (frame time x speed). Each frame we ask the
// pure sim engine (sampleTimeline) where the picker is at that time.

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { sampleTimeline, type Timeline } from '../sim/timeline';
import type { WarehouseModel } from '../sim/model';
import { useStore } from '../store';
import { toWorld } from './helpers';

const COUNTER_UPDATE_S = 0.1; // push counters to the UI 10x per second (not every frame)

export function Picker({ model, timeline }: { model: WarehouseModel; timeline: Timeline }) {
  const grid = model.grid;
  const groupRef = useRef<Group>(null);
  const clock = useRef(0); // simulated seconds since replay start
  const sinceUpdate = useRef(0);
  const [tripIdx, setTripIdx] = useState(0);

  const replayId = useStore((s) => s.replayId);
  const setLive = useStore((s) => s.setLive);

  // Restart the clock when the replay restarts or the timeline changes.
  useEffect(() => {
    clock.current = 0;
    setTripIdx(0);
  }, [replayId, timeline]);

  useFrame((_, delta) => {
    const { playing, speed, setPlaying } = useStore.getState();
    if (playing) clock.current = Math.min(timeline.duration, clock.current + delta * speed);

    const s = sampleTimeline(model, timeline, clock.current);
    const [x, z] = toWorld(grid, s.x, s.y);
    groupRef.current?.position.set(x, 0, z);

    sinceUpdate.current += delta;
    const finished = playing && clock.current >= timeline.duration;
    if (sinceUpdate.current >= COUNTER_UPDATE_S || finished) {
      sinceUpdate.current = 0;
      setLive({ distance: s.distance, elapsed: clock.current, ordersDone: s.ordersDone, tripIdx: s.tripIdx, waitS: 0 });
      if (s.tripIdx !== tripIdx) setTripIdx(s.tripIdx);
    }
    if (finished) setPlaying(false);
  });

  // Route of the current trip: every walk segment joined into one line.
  const routePoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (const step of timeline.steps) {
      if (step.tripIdx !== tripIdx || step.kind !== 'walk') continue;
      for (const c of step.path) {
        const [x, z] = toWorld(grid, c.x, c.y);
        pts.push([x, 0.06, z]);
      }
    }
    return pts;
  }, [timeline, tripIdx, grid]);

  const stops = timeline.stopsByTrip[tripIdx]?.slice(1, -1) ?? [];

  return (
    <group>
      {routePoints.length > 1 && <Line points={routePoints} color="#4cc9f0" lineWidth={2} transparent opacity={0.7} />}

      {/* Pick points of the current trip */}
      {stops.map((node) => {
        const [x, z] = toWorld(grid, grid.nodes[node].x, grid.nodes[node].y);
        return (
          <mesh key={node} rotation-x={-Math.PI / 2} position={[x, 0.05, z]}>
            <ringGeometry args={[0.25, 0.4, 24]} />
            <meshBasicMaterial color="#4cc9f0" />
          </mesh>
        );
      })}

      <group ref={groupRef}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <capsuleGeometry args={[0.28, 0.9, 4, 12]} />
          <meshStandardMaterial color="#f8f9fa" emissive="#4cc9f0" emissiveIntensity={0.25} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.45, 24]} />
          <meshBasicMaterial color="#4cc9f0" transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
}
