"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  type Box3Helper,
  Color,
  Mesh,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { sendCursor } from "@/collab/activePresence";
import { useCollabStore } from "@/collab/collabStore";
import type { Holder } from "@/collab/objectHolds";
import type { Cursor } from "@/collab/presence";
import { stepGlides } from "@/collab/remoteGlide";
import { useSceneStore } from "@/store/sceneStore";
import { getMesh, getRegisteredObjects } from "./meshRegistry";

/** The pointer is sent to the others at most this often (ms). */
const CURSOR_EVERY_MS = 100;
/** A pointer over empty space lands on the ground, unless that is further than this (units). */
const GROUND_REACH = 200;
/** How fast a shown pointer glides to its new place (the share of the way covered each frame, at 60 fps). */
const CURSOR_GLIDE = 0.35;

/**
 * An object someone else holds (they have it selected): a box in their colour, a faint tint over it, and their name over it
 * (selection locks, collab/objectHolds.ts). Everything follows the object every frame, so it stays right while it moves.
 */
function HeldObject({ nodeId, holder }: { nodeId: string; holder: Holder }) {
  const helper = useRef<Box3Helper>(null);
  const tint = useRef<Mesh>(null);
  const label = useRef<HTMLDivElement | null>(null);
  const gl = useThree((state) => state.gl);
  // The name label over the object: a plain DOM element in the canvas's parent, moved to the object's top every frame by
  // projecting that point to the screen. (drei's `Html` makes a React root of its own for each label, and unmounting it while
  // the scene is updating makes React complain; a plain element has nothing of the kind.)
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const element = document.createElement("div");
    element.dataset["testid"] = "held-label";
    element.textContent = `${holder.name} is working on this`;
    Object.assign(element.style, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "none",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      borderRadius: "4px",
      padding: "2px 6px",
      font: "500 11px system-ui, sans-serif",
      color: "#13202a",
      backgroundColor: holder.color,
      willChange: "transform",
    });
    parent.appendChild(element);
    label.current = element;
    return () => {
      label.current = null;
      element.remove();
    };
  }, [gl, holder.name, holder.color]);
  const camera = useThree((state) => state.camera);
  const canvasSize = useThree((state) => state.size);
  const args = useMemo(
    () => [new Box3(), new Color(holder.color)] as [Box3, Color],
    [holder.color],
  );
  const size = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);
  const top = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const current = helper.current;
    const shade = tint.current;
    if (!current || !shade) return;
    const object = getMesh(nodeId);
    const element = label.current;
    if (!object) {
      current.visible = shade.visible = false;
      if (element) element.style.display = "none";
      return;
    }
    current.box.setFromObject(object);
    const shown = !current.box.isEmpty();
    current.visible = shade.visible = shown;
    if (!shown) {
      if (element) element.style.display = "none";
      return;
    }
    current.box.getSize(size);
    current.box.getCenter(center);
    shade.position.copy(center);
    shade.scale.copy(size);
    if (element) {
      top.set(center.x, current.box.max.y, center.z).project(camera);
      // Behind the camera, or far outside the view: nothing to show
      const onScreen =
        top.z < 1 && Math.abs(top.x) < 1.2 && Math.abs(top.y) < 1.2;
      element.style.display = onScreen ? "block" : "none";
      if (onScreen) {
        const x = (top.x * 0.5 + 0.5) * canvasSize.width;
        const y = (-top.y * 0.5 + 0.5) * canvasSize.height;
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
      }
    }
  });
  return (
    <>
      <box3Helper ref={helper} args={args} raycast={() => null} />
      <mesh ref={tint} raycast={() => null} renderOrder={998}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={holder.color}
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/** The objects other people hold, drawn in their colours with their names. */
function HeldObjects() {
  const holds = useCollabStore((state) => state.holds);
  return (
    <>
      {Object.entries(holds).map(([id, holder]) => (
        <HeldObject
          key={`${holder.clientId}:${id}`}
          nodeId={id}
          holder={holder}
        />
      ))}
    </>
  );
}

/** One other person's pointer: a small ball in their colour with their name, gliding to where they point. */
function RemoteCursor({ cursor }: { cursor: Cursor }) {
  const group = useRef<Group>(null);
  const target = useMemo(
    () => new Vector3(...cursor.position),
    [cursor.position],
  );
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    if (g.userData["placed"] !== true) {
      g.position.copy(target);
      g.userData["placed"] = true;
    } else {
      g.position.lerp(target, 1 - Math.pow(1 - CURSOR_GLIDE, delta * 60));
    }
  });
  return (
    <group ref={group}>
      <mesh raycast={() => null} renderOrder={999}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshBasicMaterial color={cursor.color} depthTest={false} />
      </mesh>
      <Html
        center={false}
        style={{ pointerEvents: "none" }}
        position={[0.1, 0.1, 0]}
      >
        <span
          style={{ backgroundColor: cursor.color }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-[#13202a]"
        >
          {cursor.name}
        </span>
      </Html>
    </group>
  );
}

function RemoteCursors() {
  const cursors = useCollabStore((state) => state.cursors);
  return (
    <>
      {cursors.map((cursor) => (
        <RemoteCursor key={cursor.clientId} cursor={cursor} />
      ))}
    </>
  );
}

/**
 * Tells the others where this person's pointer is in the scene: the first object under it, else the ground. At most ten
 * times a second, and only when someone else is there to see it.
 */
function CursorBroadcaster() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const pointer = new Vector2();
    const point = new Vector3();
    let last = 0;
    const onMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - last < CURSOR_EVERY_MS) return;
      if (useCollabStore.getState().people.length === 0) return;
      last = now;
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(getRegisteredObjects(), true)
        .find((entry) => entry.object instanceof Mesh);
      if (hit) {
        sendCursor([hit.point.x, hit.point.y, hit.point.z]);
      } else if (
        raycaster.ray.intersectPlane(ground, point) &&
        point.distanceTo(raycaster.ray.origin) < GROUND_REACH
      ) {
        sendCursor([point.x, point.y, point.z]);
      } else {
        sendCursor(null);
      }
    };
    const onLeave = () => sendCursor(null);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [gl, camera]);
  return null;
}

/** Objects other people moved glide to their new place (collab/remoteGlide.ts), one step each frame. */
function RemoteGlide() {
  useFrame(() =>
    stepGlides((id) => useSceneStore.getState().scene.nodes[id], getMesh),
  );
  return null;
}

/** Other people in the 3D view: their selections and their pointers; and sending yours. Nothing when not online. */
export default function PresenceLayer() {
  const active = useCollabStore((state) => state.active);
  if (!active) return null;
  return (
    <>
      <RemoteGlide />
      <HeldObjects />
      <RemoteCursors />
      <CursorBroadcaster />
    </>
  );
}
