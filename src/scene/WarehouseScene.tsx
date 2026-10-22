// The 3D canvas: camera, lights, controls and all scene pieces.

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useStore } from '../store';
import { Floor } from './Floor';
import { useTimeline } from './helpers';
import { Picker } from './Picker';
import { Racks } from './Racks';

export function WarehouseScene() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layout = useStore((s) => s.layouts[s.active]);
  const timeline = useTimeline();
  if (!model || !data || !timeline) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_DIR, fov: 45, near: 0.5, far: 200 }}
      onPointerMissed={() => useStore.getState().setHovered(null)}
    >
      <color attach="background" args={['#0b0f17']} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[-12, 25, 15]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

      <FitCamera />
      <Floor grid={model.grid} />
      <Racks grid={model.grid} layout={layout} products={data.products} />
      <Picker model={model} timeline={timeline} />

      {/* Orbit but never below the floor; zoom limits keep the floor in view */}
      <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.3} minDistance={8} maxDistance={60} enableDamping />
    </Canvas>
  );
}

// Default view: from the front, slightly to the left (dock side), looking down.
const CAMERA_DIR: [number, number, number] = [-5, 28, 26];
const FLOOR_VIEW_WIDTH = 36; // metres that should fit across the screen

// Move the camera back on narrow screens so the whole floor stays in view.
// Runs when the canvas is resized; the user can still orbit/zoom freely.
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return; // canvas not laid out yet
    const aspect = size.width / size.height;
    const vFov = (45 * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const needed = FLOOR_VIEW_WIDTH / 2 / Math.tan(hFov / 2); // distance to fit the width
    const base = Math.hypot(...CAMERA_DIR);
    const scale = Math.max(1, needed / base);
    camera.position.set(CAMERA_DIR[0] * scale, CAMERA_DIR[1] * scale, CAMERA_DIR[2] * scale);
    camera.lookAt(0, 0, 0);
  }, [camera, size.width, size.height]);
  return null;
}
