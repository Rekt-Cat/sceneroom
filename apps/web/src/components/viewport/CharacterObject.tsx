"use client";

import { useEffect, useMemo } from "react";
import { Edges, Line } from "@react-three/drei";
import {
  BONE_PARENT,
  CHARACTER_BONES,
  DEFAULT_CHARACTER,
  boneRotation,
  buildParts,
  characterBounds,
  groundLift,
  proportions,
  restOffsets,
  roleColor,
  type BodyPart,
  type CharacterBone,
  type CharacterSettings,
  type Material,
} from "@sceneroom/shared";
import { useCharacterViewStore } from "@/store/characterViewStore";
import SurfaceMaterial from "./SurfaceMaterial";
import { buildMeshGeometry } from "./shapeGeometry";
import { OUTLINE_COLOR } from "./selectionStyle";

/** The colour of the bones and joints drawn over a selected character. */
const SKELETON_COLOR = "#ffd24a";

/** The size of the ball drawn at each joint, as a fraction of the character's height. */
const JOINT_SIZE = 0.012;

/** The bones that hang from each bone, in skeleton order. */
const CHILDREN: Record<CharacterBone, CharacterBone[]> = (() => {
  const map = Object.fromEntries(
    CHARACTER_BONES.map((bone) => [bone, [] as CharacterBone[]]),
  ) as Record<CharacterBone, CharacterBone[]>;
  for (const bone of CHARACTER_BONES) {
    const parent = BONE_PARENT[bone];
    if (parent) map[parent].push(bone);
  }
  return map;
})();

/**
 * The inside of a "character" object: the skeleton as nested groups (each bone is a group at its joint, turned
 * by the pose) with the body parts attached to the bones. Posing therefore only changes the turn of some groups;
 * the shape of the body is built again only when the proportions, hair or clothes change, not when the pose does.
 * The body is lowered or raised so its lowest point is on the ground (if that is on).
 */
export default function CharacterObject({
  character,
  material,
  selected,
  cut,
}: {
  character: CharacterSettings;
  material: Material;
  selected: boolean;
  cut: boolean;
}) {
  // The settings the SHAPE of the body depends on (not the pose, and not the colours: those do not change the
  // geometry), kept as one object that only changes when one of them does
  const {
    height,
    build,
    headSize,
    legRatio,
    armScale,
    hair,
    longSleeves,
    longPants,
  } = character;
  const shape = useMemo<CharacterSettings>(
    () => ({
      ...DEFAULT_CHARACTER,
      height,
      build,
      headSize,
      legRatio,
      armScale,
      hair,
      longSleeves,
      longPants,
    }),
    [height, build, headSize, legRatio, armScale, hair, longSleeves, longPants],
  );
  const parts = useMemo(() => buildParts(shape), [shape]);
  const offsets = useMemo(() => restOffsets(proportions(shape)), [shape]);
  const geometries = useMemo(
    () => parts.map((part) => buildMeshGeometry(part.mesh, [])),
    [parts],
  );
  useEffect(
    () => () => {
      for (const geometry of geometries) geometry.dispose();
    },
    [geometries],
  );

  const lift = useMemo(() => groundLift(character, parts), [character, parts]);
  const bounds = useMemo(() => characterBounds(character), [character]);
  const showSkeleton =
    useCharacterViewStore((state) => state.showSkeleton) && selected;

  const partsOf = (bone: CharacterBone) =>
    parts.flatMap((part, index) =>
      part.bone === bone ? [{ part, geometry: geometries[index]! }] : [],
    );

  const renderBone = (bone: CharacterBone) => {
    const [x, y, z] = offsets[bone];
    return (
      <group
        key={bone}
        name={bone}
        position={[x, bone === "hips" ? y + lift : y, z]}
        rotation={boneRotation(bone, character.pose[bone])}
      >
        {partsOf(bone).map(({ part, geometry }, i) => (
          <PartMesh
            key={i}
            part={part}
            geometry={geometry}
            character={character}
            material={material}
            cut={cut}
          />
        ))}
        {showSkeleton && (
          <mesh renderOrder={20}>
            <sphereGeometry args={[character.height * JOINT_SIZE, 8, 6]} />
            <meshBasicMaterial
              color={SKELETON_COLOR}
              depthTest={false}
              transparent
            />
          </mesh>
        )}
        {CHILDREN[bone].map((child) => (
          <group key={`link-${child}`}>
            {showSkeleton && (
              <Line
                points={[[0, 0, 0], offsets[child]]}
                color={SKELETON_COLOR}
                lineWidth={2}
                depthTest={false}
                renderOrder={20}
                raycast={() => undefined}
              />
            )}
          </group>
        ))}
        {CHILDREN[bone].map(renderBone)}
      </group>
    );
  };

  const size: [number, number, number] = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const middle: [number, number, number] = [
    (bounds.max[0] + bounds.min[0]) / 2,
    (bounds.max[1] + bounds.min[1]) / 2,
    (bounds.max[2] + bounds.min[2]) / 2,
  ];

  return (
    <>
      {renderBone("hips")}
      {selected && (
        // The amber box round a selected character (like a model: it has no single outline)
        <mesh position={middle} raycast={() => undefined}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
          <Edges color={OUTLINE_COLOR} />
        </mesh>
      )}
    </>
  );
}

function PartMesh({
  part,
  geometry,
  character,
  material,
  cut,
}: {
  part: BodyPart;
  geometry: ReturnType<typeof buildMeshGeometry>;
  character: CharacterSettings;
  material: Material;
  cut: boolean;
}) {
  return (
    <mesh
      geometry={geometry}
      castShadow={material.castShadow}
      receiveShadow={material.receiveShadow}
    >
      <SurfaceMaterial
        color={roleColor(character, part.role)}
        material={material}
        cut={cut}
      />
    </mesh>
  );
}
