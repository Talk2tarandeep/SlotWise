// The 3D canvas: camera, lights, controls and all scene pieces.

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useStore } from '../store';
import { Building } from './Building';
import { Floor } from './Floor';
import { useHeatmaps, useMultiSim, useTimeline } from './helpers';
import { MultiPickers } from './MultiPickers';
import { Picker } from './Picker';
import { Racks } from './Racks';
import { SCENE } from './theme';
import { TrafficHeatmap } from './TrafficHeatmap';

export function WarehouseScene() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layout = useStore((s) => s.layouts[s.active]);
  const timeline = useTimeline();
  const heatmaps = useHeatmaps();
  const multiSim = useMultiSim();
  if (!model || !data || !timeline) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_DIR, fov: 45, near: 0.5, far: 200 }}
      onPointerMissed={() => useStore.getState().setHovered(null)}
    >
      {/* Light theme: pale background that the fog fades into */}
      <color attach="background" args={[SCENE.background]} />
      <fog attach="fog" args={[SCENE.background, SCENE.fogNear, SCENE.fogFar]} />

      {/* Soft sky light from above + bounce from the floor */}
      <hemisphereLight args={[SCENE.skyLight, SCENE.groundLight, 1.1]} />
      {/* The only shadow-casting light: a "sun" through the skylights */}
      <directionalLight
        position={[-14, 30, 18]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <FitCamera />
      {import.meta.env.DEV && <DevExpose />}
      <Floor grid={model.grid} />
      <Building grid={model.grid} />
      {heatmaps.current && heatmaps.reference && (
        <TrafficHeatmap grid={model.grid} heat={heatmaps.current} scaleMax={heatmaps.reference.maxCellPasses} />
      )}
      <Racks grid={model.grid} layout={layout} products={data.products} />
      {multiSim ? <MultiPickers grid={model.grid} sim={multiSim} /> : <Picker model={model} timeline={timeline} />}

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

// Dev-only: expose the camera and renderer in the browser console for
// debugging (e.g. renderer.info.render.calls = draw calls per frame).
function DevExpose() {
  const { camera, gl } = useThree();
  useEffect(() => {
    (window as unknown as { three: object }).three = { camera, gl };
  }, [camera, gl]);
  return null;
}
