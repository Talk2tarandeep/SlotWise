// The building around the floor: low perimeter walls (back + sides) and an
// "AISLE n" sign on a small gantry at the front end of every aisle.

import { Text } from '@react-three/drei';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D } from 'three';
import type { Grid } from '../sim/grid';
import { SLAB_MARGIN_BACK, SLAB_MARGIN_FRONT, SLAB_MARGIN_X } from './Floor';
import { FONT_BOLD, SCENE } from './theme';

const WALL_HEIGHT = 1.4;
const WALL_THICKNESS = 0.3;
const SIGN_Y = 3.8; // board centre height (clears racks up to ~3.4 m)
const SIGN_W = 2.8;
const SIGN_H = 0.8;
const SIGN_TILT = 0.35; // radians (~20 deg): board leans towards the viewer so it reads from above

export function Building({ grid }: { grid: Grid }) {
  const halfW = grid.width / 2 + SLAB_MARGIN_X;
  const backZ = -grid.height / 2 - SLAB_MARGIN_BACK;
  const frontZ = grid.height / 2 + SLAB_MARGIN_FRONT;
  const depth = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;

  return (
    <group>
      {/* Back wall + two side walls (front left open so the camera sees in) */}
      <Wall position={[0, WALL_HEIGHT / 2, backZ]} size={[2 * halfW + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[-halfW, WALL_HEIGHT / 2, midZ]} size={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
      <Wall position={[halfW, WALL_HEIGHT / 2, midZ]} size={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
      {/* Text waits for its font; its own Suspense keeps the rest of the scene from waiting too */}
      <Suspense fallback={null}>
        <AisleSigns grid={grid} />
      </Suspense>
    </group>
  );
}

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={SCENE.wall} roughness={0.9} />
      </mesh>
      {/* darker cap on top so the wall edge reads clearly */}
      <mesh position={[0, size[1] / 2 + 0.03, 0]}>
        <boxGeometry args={[size[0] + 0.02, 0.06, size[2] + 0.02]} />
        <meshStandardMaterial color={SCENE.wallCap} />
      </mesh>
    </group>
  );
}

// One sign per aisle: 2 posts (on the rack ends, out of the walkway) + a blue
// board. Posts and boards are instanced; only the 6 text labels are separate.
function AisleSigns({ grid }: { grid: Grid }) {
  const cfg = grid.config;
  const blockWidth = 2 * cfg.rackDepth + cfg.aisleWidth;
  const postsRef = useRef<InstancedMesh>(null);
  const boardsRef = useRef<InstancedMesh>(null);

  // Posts stand just inside the front end of each rack, so they never sit on a walking path.
  const signZ = grid.height / 2 - cfg.crossAisleWidth - 0.15;
  const signs = useMemo(
    () =>
      Array.from({ length: cfg.aisles }, (_, a) => {
        const x0 = a * blockWidth - grid.width / 2;
        return {
          aisle: a,
          centreX: x0 + cfg.rackDepth + cfg.aisleWidth / 2,
          postXs: [x0 + cfg.rackDepth / 2, x0 + cfg.rackDepth + cfg.aisleWidth + cfg.rackDepth / 2],
        };
      }),
    [cfg, blockWidth, grid.width],
  );

  useLayoutEffect(() => {
    const d = new Object3D();
    let i = 0;
    for (const s of signs) {
      for (const x of s.postXs) {
        d.position.set(x, (SIGN_Y + SIGN_H / 2) / 2, signZ);
        d.updateMatrix();
        postsRef.current!.setMatrixAt(i++, d.matrix);
      }
    }
    postsRef.current!.instanceMatrix.needsUpdate = true;
    signs.forEach((s, k) => {
      d.position.set(s.centreX, SIGN_Y, signZ);
      d.rotation.set(SIGN_TILT, 0, 0);
      d.updateMatrix();
      boardsRef.current!.setMatrixAt(k, d.matrix);
    });
    boardsRef.current!.instanceMatrix.needsUpdate = true;
  }, [signs, signZ]);

  return (
    <group>
      <instancedMesh ref={postsRef} args={[undefined, undefined, signs.length * 2]} castShadow raycast={() => null}>
        <boxGeometry args={[0.08, SIGN_Y + SIGN_H / 2, 0.08]} />
        <meshStandardMaterial color={SCENE.signPost} metalness={0.4} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={boardsRef} args={[undefined, undefined, signs.length]} castShadow raycast={() => null}>
        <boxGeometry args={[SIGN_W, SIGN_H, 0.06]} />
        <meshStandardMaterial color={SCENE.signBoard} roughness={0.6} />
      </instancedMesh>
      {signs.map((s) => (
        <group key={s.aisle} position={[s.centreX, SIGN_Y, signZ]} rotation-x={SIGN_TILT}>
          {/* front face (towards the dock / default camera) and back face */}
          <Text font={FONT_BOLD} fontSize={0.46} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, 0.035]}>
            {`AISLE ${s.aisle + 1}`}
          </Text>
          <Text font={FONT_BOLD} fontSize={0.46} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, -0.035]} rotation-y={Math.PI}>
            {`AISLE ${s.aisle + 1}`}
          </Text>
        </group>
      ))}
    </group>
  );
}
