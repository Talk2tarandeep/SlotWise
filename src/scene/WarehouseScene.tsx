// The 3D canvas: lights, camera rig and all scene pieces.

import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useStore } from '../store';
import { Building } from './Building';
import { CameraRig } from './CameraRig';
import { CongestionOverlay } from './CongestionOverlay';
import { Floor } from './Floor';
import { useHeatmaps, useReplaySim } from './helpers';
import { AisleHitAreas } from './Interactables';
import { Pickers } from './Pickers';
import { Racks } from './Racks';
import { SCENE } from './theme';
import { TrafficHeatmap } from './TrafficHeatmap';

export function WarehouseScene() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layout = useStore((s) => s.layouts[s.active]);
  const overlay = useStore((s) => s.overlay);
  const pickers = useStore((s) => s.pickers);
  const heatmaps = useHeatmaps();
  const sim = useReplaySim();
  if (!model || !data || !sim) return null;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [-5, 28, 26], fov: 45, near: 0.5, far: 200 }}
      onPointerMissed={() => {
        useStore.getState().setHovered(null);
        useStore.getState().setInspect(null); // click on empty space closes the inspector
      }}
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

      <CameraRig />
      {import.meta.env.DEV && <DevExpose />}
      <Floor grid={model.grid} />
      <Building grid={model.grid} />
      <AisleHitAreas grid={model.grid} />
      {heatmaps.current && heatmaps.reference && (
        <TrafficHeatmap grid={model.grid} heat={heatmaps.current} scaleMax={heatmaps.reference.maxCellPasses} />
      )}
      {overlay === 'congestion' && pickers > 1 && <CongestionOverlay grid={model.grid} sim={sim} />}
      <Racks grid={model.grid} layout={layout} products={data.products} />
      <Pickers model={model} sim={sim} />
    </Canvas>
  );
}

// Dev-only: expose the camera and renderer in the browser console for
// debugging (e.g. renderer.info.render.calls = draw calls per frame).
function DevExpose() {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    (window as unknown as { three: object }).three = { camera, gl, scene };
  }, [camera, gl, scene]);
  return null;
}
