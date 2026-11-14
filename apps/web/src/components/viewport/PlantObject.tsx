"use client";

import { useEffect, useMemo } from "react";
import { Outlines } from "@react-three/drei";
import type { Material, PlantSettings } from "@sceneroom/shared";
import SurfaceMaterial from "./SurfaceMaterial";
import { buildPlantGeometries } from "./plantGeometry";
import { OUTLINE_COLOR, OUTLINE_THICKNESS } from "./selectionStyle";

/**
 * The inside of a "plant" object: the wood (trunk and branches, in the object's colour) and the leaves (in
 * the leaf colour), grown from the plant's settings. The shape is worked out again only when a setting
 * changes. Both parts have the same surface (roughness, shadows ...) as the object.
 */
export default function PlantObject({
  plant,
  color,
  material,
  selected,
  cut,
}: {
  plant: PlantSettings;
  color: string;
  material: Material;
  selected: boolean;
  cut: boolean;
}) {
  const geometries = useMemo(() => buildPlantGeometries(plant), [plant]);
  useEffect(
    () => () => {
      geometries.bark.dispose();
      geometries.leaves?.dispose();
    },
    [geometries],
  );

  return (
    <>
      <mesh
        geometry={geometries.bark}
        castShadow={material.castShadow}
        receiveShadow={material.receiveShadow}
      >
        <SurfaceMaterial color={color} material={material} cut={cut} />
        {selected && (
          <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
        )}
      </mesh>
      {geometries.leaves && (
        <mesh
          geometry={geometries.leaves}
          castShadow={material.castShadow}
          receiveShadow={material.receiveShadow}
        >
          <SurfaceMaterial
            color={plant.leafColor}
            material={material}
            cut={cut}
          />
          {selected && (
            <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
          )}
        </mesh>
      )}
    </>
  );
}
