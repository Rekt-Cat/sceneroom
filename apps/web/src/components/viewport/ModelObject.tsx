"use client";

import {
  Component,
  Suspense,
  use,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Edges } from "@react-three/drei";
import { Mesh } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { modelOffset, modelSize, type AssetInfo } from "@sceneroom/shared";
import { loadModelScene } from "@/assets/loadModel";
import { useSceneStore } from "@/store/sceneStore";
import { OUTLINE_COLOR } from "./selectionStyle";

/** The part of the scene that does not take clicks: placeholders and the selection box. */
const hitNothing = () => undefined;

type Size = [number, number, number];

/** A box standing where the model will be: grey while it loads, red if it cannot be shown. */
function Placeholder({ size, failed }: { size: Size; failed: boolean }) {
  return (
    <mesh position={[0, size[1] / 2, 0]} raycast={hitNothing}>
      <boxGeometry args={size} />
      <meshBasicMaterial wireframe color={failed ? "#e5545f" : "#7c8791"} />
    </mesh>
  );
}

/** The amber box drawn around a selected model (a model has no single outline like a shape does). */
function SelectionBox({ size }: { size: Size }) {
  return (
    <mesh position={[0, size[1] / 2, 0]} raycast={hitNothing}>
      <boxGeometry args={size} />
      <meshBasicMaterial visible={false} />
      <Edges color={OUTLINE_COLOR} />
    </mesh>
  );
}

/** Shows the model once its file is loaded. Waits (suspends) until then. */
function LoadedModel({
  info,
  castShadow,
  receiveShadow,
}: {
  info: AssetInfo;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const root = use(loadModelScene(info.id));
  // Each object gets its own copy (SkeletonUtils.clone also copies bones correctly for animated models)
  const copy = useMemo(() => clone(root), [root]);
  // The shadow switches of the object apply to every part of the model
  useEffect(() => {
    copy.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = castShadow;
      object.receiveShadow = receiveShadow;
    });
  }, [copy, castShadow, receiveShadow]);
  const [x, y, z] = modelOffset(info);
  return (
    <group position={[x, y, z]}>
      <primitive object={copy} />
    </group>
  );
}

/** If the model cannot be loaded or shown, show the red placeholder instead of breaking the whole scene. */
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Could not show an imported model:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The inside of a "model" object: the imported file, standing with the middle of its bottom face at
 * the object's origin (see modelOffset), a placeholder while it loads or if it fails, and the box
 * around it when selected.
 */
export default function ModelObject({
  assetId,
  selected,
  cut,
  castShadow,
  receiveShadow,
}: {
  assetId: string | null;
  selected: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /** True if the object is marked as cut: a grey wireframe box is drawn over the model (a model's own materials are shared, so it cannot be faded). */
  cut: boolean;
}) {
  const info = useSceneStore((state) =>
    assetId ? state.scene.assets[assetId] : undefined,
  );
  if (!info) return <Placeholder size={[1, 1, 1]} failed />;

  // A flat model would give a zero-size box, which cannot be drawn
  const size = modelSize(info).map((value) => Math.max(value, 0.001)) as Size;

  return (
    <>
      <ModelErrorBoundary
        key={info.id}
        fallback={<Placeholder size={size} failed />}
      >
        <Suspense fallback={<Placeholder size={size} failed={false} />}>
          <LoadedModel
            info={info}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
          />
        </Suspense>
      </ModelErrorBoundary>
      {selected && <SelectionBox size={size} />}
      {cut && <Placeholder size={size} failed={false} />}
    </>
  );
}
