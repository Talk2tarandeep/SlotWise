// A walking warehouse worker (Mixamo character "Ch17": hard hat + hi-vis vest).
//
// The model is public/models/picker.glb: converted from Mixamo FBX to GLB,
// textures resized to 1024px WebP (65 MB -> 2.3 MB), and the root motion
// removed so the walk plays "in place" - the simulation moves the parent group.
//
// This component only handles looks:
//  - turns the worker to face the direction the parent group is moving,
//  - plays the walk cycle at a speed matching how fast they move
//    (and pauses it while they stand still at a shelf or the dock),
//  - tints the hi-vis vest with the picker's colour so pickers are distinguishable.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

const MODEL_URL = '/models/picker.glb';
const ANIM_WALK_SPEED = 0.6; // m/s the walk clip was authored at (1.72 m over ~2.9 s)
const TURN_RATE = 10; // how quickly the worker turns towards the walking direction

export function HumanPicker({ color }: { color: string }) {
  const { scene, animations } = useGLTF(MODEL_URL);
  const turnRef = useRef<THREE.Group>(null);
  const lastPos = useRef<THREE.Vector3 | null>(null);
  const heading = useRef(0);

  // Each picker needs its own copy of the skinned model and its own materials.
  const character = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned meshes can be wrongly culled when animated
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    });
    return clone;
  }, [scene]);

  const mixer = useMemo(() => new THREE.AnimationMixer(character), [character]);
  const action = useMemo(
    () => (animations.length > 0 ? mixer.clipAction(animations[0]) : null),
    [mixer, animations],
  );

  useEffect(() => {
    action?.reset().play();
    return () => {
      mixer.stopAllAction();
    };
  }, [action, mixer]);

  // Tint ONLY the vest (the body texture is shared, so tinting everything would tint skin too).
  useEffect(() => {
    character.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !/Vest/i.test(mesh.name)) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(color).lerp(new THREE.Color('#ffffff'), 0.25);
    });
  }, [character, color]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const g = turnRef.current;
    if (!g) return;

    // How far did the parent (positioned by the sim) move since last frame?
    const pos = new THREE.Vector3();
    g.getWorldPosition(pos);
    let speed = 0;
    if (lastPos.current && delta > 0) {
      const dx = pos.x - lastPos.current.x;
      const dz = pos.z - lastPos.current.z;
      const dist = Math.hypot(dx, dz);
      speed = dist / delta;
      if (dist > 1e-4) heading.current = Math.atan2(dx, dz); // model faces +Z
    }
    lastPos.current = pos;

    // Smoothly turn towards the heading (shortest way round).
    let diff = heading.current - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, TURN_RATE * delta);

    // Walk faster when moving faster; pause the stride when standing still.
    if (action) action.timeScale = speed > 0.05 ? THREE.MathUtils.clamp(speed / ANIM_WALK_SPEED, 0.6, 3) : 0;
    mixer.update(delta);
  });

  return (
    <group ref={turnRef}>
      <primitive object={character} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
