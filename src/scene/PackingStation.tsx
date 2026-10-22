// Packing workstation at the dock: an industrial steel packing bench with a
// few props. Built from simple primitives (no downloaded models).
//
// Dimensions (metres) follow a real packing bench and the worker model
// (1.79 m tall, waist ~1.0 m): worktop surface at 0.90 m (hip height),
// 2.4 m wide x 0.8 m deep, steel frame with an apron under the top, four
// legs on levelling feet, lower stretchers and a lower shelf.
//
// The group's origin is the centre of the bench footprint on the floor; the
// worker (dock cell) stands behind the bench's left end.

import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import { BoxGeometry, CanvasTexture, CylinderGeometry, MeshStandardMaterial, SRGBColorSpace, TorusGeometry } from 'three';

// Bench dimensions
const W = 2.4; // width (x)
const D = 0.8; // depth (z)
const TOP_Y = 0.9; // height of the work surface
const TOP_T = 0.04; // worktop thickness
const LEG = 0.06; // square leg tube size
const INSET = 0.08; // leg centre distance from the worktop edge
const APRON_H = 0.07; // frame rail right under the worktop
const STRETCHER_Y = 0.16; // lower rails / shelf height
const FOOT_H = 0.03;

const legX = W / 2 - INSET;
const legZ = D / 2 - INSET;
const legTop = TOP_Y - TOP_T - APRON_H;
const legLen = legTop - FOOT_H;

// Shared materials (created once for all meshes).
const frameMat = new MeshStandardMaterial({ color: '#3d434b', metalness: 0.55, roughness: 0.45 }); // dark grey powder-coated steel
const topMat = new MeshStandardMaterial({ color: '#c7ccd2', metalness: 0.35, roughness: 0.5 }); // light grey steel worktop
const shelfMat = new MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.4, roughness: 0.55 });
const rubberMat = new MeshStandardMaterial({ color: '#1f2328', roughness: 0.9 });
const kraftMat = new MeshStandardMaterial({ color: '#c8a26b', roughness: 0.85 });
const kraftDarkMat = new MeshStandardMaterial({ color: '#b48d58', roughness: 0.85 });
const tapeMat = new MeshStandardMaterial({ color: '#d9b77a', roughness: 0.4, metalness: 0.05 });
const plasticMat = new MeshStandardMaterial({ color: '#25292e', roughness: 0.6 });
const redMat = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.5 });
const scanWindowMat = new MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 0.6 });

// Shared geometries.
const unitBox = new BoxGeometry(1, 1, 1); // scaled per mesh
const footGeo = new CylinderGeometry(0.035, 0.04, FOOT_H, 12);
const tapeRollGeo = new TorusGeometry(0.045, 0.018, 10, 24);

// A box mesh from the shared unit cube: size and position in metres.
function Part({ size, position, material, rotation }: { size: [number, number, number]; position: [number, number, number]; material: MeshStandardMaterial; rotation?: [number, number, number] }) {
  return <mesh geometry={unitBox} material={material} scale={size} position={position} rotation={rotation} castShadow receiveShadow />;
}

// Soft dark blob on the floor under the bench: cheap "ambient occlusion" so it looks grounded.
function useContactShadow() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);
}

export function PackingStation({ position, onSelect }: { position: [number, number, number]; onSelect?: () => void }) {
  const shadowTex = useContactShadow();
  const corners: [number, number][] = [
    [-legX, -legZ],
    [legX, -legZ],
    [-legX, legZ],
    [legX, legZ],
  ];

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // a camera drag, not a click
    e.stopPropagation();
    onSelect?.();
  };

  return (
    <group
      position={position}
      onClick={click}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {/* Contact shadow on the floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 0]} raycast={() => null}>
        <planeGeometry args={[W + 0.5, D + 0.5]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>

      {/* ---------- Bench ---------- */}
      {/* Worktop */}
      <Part size={[W, TOP_T, D]} position={[0, TOP_Y - TOP_T / 2, 0]} material={topMat} />
      {/* Apron frame under the worktop (front, back, sides) */}
      <Part size={[W - 2 * INSET, APRON_H, 0.03]} position={[0, legTop + APRON_H / 2, legZ]} material={frameMat} />
      <Part size={[W - 2 * INSET, APRON_H, 0.03]} position={[0, legTop + APRON_H / 2, -legZ]} material={frameMat} />
      <Part size={[0.03, APRON_H, D - 2 * INSET]} position={[legX, legTop + APRON_H / 2, 0]} material={frameMat} />
      <Part size={[0.03, APRON_H, D - 2 * INSET]} position={[-legX, legTop + APRON_H / 2, 0]} material={frameMat} />
      {/* Legs on levelling feet */}
      {corners.map(([x, z]) => (
        <group key={`${x},${z}`}>
          <Part size={[LEG, legLen, LEG]} position={[x, FOOT_H + legLen / 2, z]} material={frameMat} />
          <mesh geometry={footGeo} material={rubberMat} position={[x, FOOT_H / 2, z]} receiveShadow />
        </group>
      ))}
      {/* Lower stretchers (front/back along the length, one each side) */}
      <Part size={[W - 2 * INSET, 0.04, 0.03]} position={[0, STRETCHER_Y, legZ]} material={frameMat} />
      <Part size={[W - 2 * INSET, 0.04, 0.03]} position={[0, STRETCHER_Y, -legZ]} material={frameMat} />
      <Part size={[0.03, 0.04, D - 2 * INSET]} position={[legX, STRETCHER_Y, 0]} material={frameMat} />
      <Part size={[0.03, 0.04, D - 2 * INSET]} position={[-legX, STRETCHER_Y, 0]} material={frameMat} />
      {/* Lower shelf resting on the stretchers */}
      <Part size={[W - 2 * INSET - 0.04, 0.015, D - 2 * INSET - 0.02]} position={[0, STRETCHER_Y + 0.028, 0]} material={shelfMat} />
      {/* Flat-packed cartons on the lower shelf */}
      {[0, 1, 2].map((i) => (
        <Part key={i} size={[0.9, 0.012, 0.45]} position={[0.35 + i * 0.01, STRETCHER_Y + 0.042 + i * 0.013, i * 0.01]} material={i % 2 ? kraftDarkMat : kraftMat} />
      ))}

      {/* ---------- Props on the worktop (kept sparse) ---------- */}
      <group position={[0, TOP_Y, 0]}>
        {/* Handheld scanner lying near the worker's end */}
        <group position={[-0.95, 0, 0.05]} rotation-y={0.5}>
          <Part size={[0.05, 0.035, 0.16]} position={[0, 0.018, 0]} material={plasticMat} />
          <Part size={[0.07, 0.05, 0.07]} position={[0, 0.025, -0.1]} material={plasticMat} />
          <Part size={[0.05, 0.03, 0.005]} position={[0, 0.027, -0.136]} material={scanWindowMat} />
        </group>

        {/* Open carton being packed, flaps folded out */}
        <group position={[-0.35, 0, 0]}>
          <Part size={[0.42, 0.01, 0.32]} position={[0, 0.005, 0]} material={kraftMat} />
          <Part size={[0.42, 0.26, 0.01]} position={[0, 0.13, 0.155]} material={kraftMat} />
          <Part size={[0.42, 0.26, 0.01]} position={[0, 0.13, -0.155]} material={kraftMat} />
          <Part size={[0.01, 0.26, 0.32]} position={[0.205, 0.13, 0]} material={kraftDarkMat} />
          <Part size={[0.01, 0.26, 0.32]} position={[-0.205, 0.13, 0]} material={kraftDarkMat} />
          {/* long flaps tilted outwards */}
          <Part size={[0.42, 0.01, 0.15]} position={[0, 0.3, 0.22]} rotation={[-0.6, 0, 0]} material={kraftMat} />
          <Part size={[0.42, 0.01, 0.15]} position={[0, 0.3, -0.22]} rotation={[0.6, 0, 0]} material={kraftMat} />
        </group>

        {/* Tape dispenser */}
        <group position={[0.22, 0, 0.18]}>
          <Part size={[0.2, 0.05, 0.08]} position={[0, 0.025, 0]} material={redMat} />
          <mesh geometry={tapeRollGeo} material={tapeMat} position={[-0.02, 0.1, 0]} castShadow />
          <Part size={[0.03, 0.06, 0.07]} position={[0.085, 0.07, 0]} material={redMat} />
        </group>

        {/* Two sealed packages, ready to ship */}
        <group position={[0.75, 0, -0.05]}>
          <Part size={[0.36, 0.22, 0.28]} position={[0, 0.11, 0]} material={kraftMat} />
          <Part size={[0.36, 0.004, 0.06]} position={[0, 0.222, 0]} material={tapeMat} />
          <group position={[0.02, 0.22, 0]} rotation-y={0.2}>
            <Part size={[0.28, 0.16, 0.22]} position={[0, 0.08, 0]} material={kraftDarkMat} />
            <Part size={[0.28, 0.004, 0.05]} position={[0, 0.162, 0]} material={tapeMat} />
          </group>
        </group>
      </group>
    </group>
  );
}

// Height of the tallest prop, used to place the label above the station.
export const STATION_TOP_Y = TOP_Y + 0.45;
