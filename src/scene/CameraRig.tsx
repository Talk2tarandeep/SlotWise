// Camera presets with smooth transitions:
//   overview - the default angled view of the whole floor,
//   top      - straight down, like a floor plan,
//   follow   - tracks the selected picker (or picker 1).
// Orbit controls stay active; choosing a preset just glides the camera there.

import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../store';
import { pickerWorld } from './Pickers';

const OVERVIEW_DIR = new Vector3(-5, 28, 26); // direction from the target (scaled to fit the screen)
const FLOOR_VIEW_WIDTH = 36; // metres that should fit across the screen
const FOLLOW_OFFSET = new Vector3(-4, 9, 9);
const GLIDE = 4; // higher = faster transitions

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const preset = useStore((s) => s.camera);
  const { camera, size } = useThree();
  const goal = useRef<{ pos: Vector3; target: Vector3 } | null>(null);

  // Distance that fits the floor width on this screen (narrow screens back off).
  const fitDistance = () => {
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (45 * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return Math.max(OVERVIEW_DIR.length(), FLOOR_VIEW_WIDTH / 2 / Math.tan(hFov / 2));
  };

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return; // canvas not laid out yet
    const d = fitDistance();
    if (preset === 'overview') goal.current = { pos: OVERVIEW_DIR.clone().setLength(d), target: new Vector3(0, 0, 0) };
    if (preset === 'top') goal.current = { pos: new Vector3(0, d * 1.05, 0.01), target: new Vector3(0, 0, 0) };
    if (preset === 'follow') goal.current = null; // handled every frame below
  }, [preset, size.width, size.height]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const k = 1 - Math.exp(-GLIDE * delta);
    if (preset === 'follow') {
      const ins = useStore.getState().inspect;
      const p = pickerWorld[ins?.kind === 'picker' ? ins.id : 0];
      if (!p) return;
      const target = new Vector3(p.x, 0, p.z);
      c.target.lerp(target, k);
      camera.position.lerp(target.clone().add(FOLLOW_OFFSET), k);
      c.update();
      return;
    }
    if (!goal.current) return;
    c.target.lerp(goal.current.target, k);
    camera.position.lerp(goal.current.pos, k);
    c.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.05) goal.current = null; // arrived: hand back to the user
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      maxPolarAngle={Math.PI / 2.2}
      minDistance={5}
      maxDistance={80}
      enableDamping
      // Any manual orbit cancels an in-progress glide.
      onStart={() => {
        if (useStore.getState().camera !== 'follow') goal.current = null;
      }}
    />
  );
}
