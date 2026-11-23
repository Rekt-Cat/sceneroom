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
import type { Cursor, Person } from "@/collab/presence";
import { getMesh, getRegisteredObjects } from "./meshRegistry";

/** The pointer is sent to the others at most this often (ms). */
const CURSOR_EVERY_MS = 100;
/** A pointer over empty space lands on the ground, unless that is further than this (units). */
const GROUND_REACH = 200;
/** How fast a shown pointer glides to its new place (the share of the way covered each frame, at 60 fps). */
const CURSOR_GLIDE = 0.35;

/** A box in a person's colour round something they have selected. */
function RemoteSelectionBox({
  nodeId,
  color,
}: {
  nodeId: string;
  color: string;
}) {
  const helper = useRef<Box3Helper>(null);
  const args = useMemo(
    () => [new Box3(), new Color(color)] as [Box3, Color],
    [color],
  );
  useFrame(() => {
    const current = helper.current;
    if (!current) return;
    const object = getMesh(nodeId);
    if (!object) {
      current.visible = false;
      return;
    }
    current.box.setFromObject(object);
    current.visible = !current.box.isEmpty();
  });
  return <box3Helper ref={helper} args={args} raycast={() => null} />;
}

/** What other people have selected, drawn as boxes in their colours (yours stays the amber outline). */
function RemoteSelections() {
  const people = useCollabStore((state) => state.people);
  return (
    <>
      {people.flatMap((person: Person) =>
        person.selection.map((id) => (
          <RemoteSelectionBox
            key={`${person.clientId}:${id}`}
            nodeId={id}
            color={person.color}
          />
        )),
      )}
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

/** Other people in the 3D view: their selections and their pointers; and sending yours. Nothing when not online. */
export default function PresenceLayer() {
  const active = useCollabStore((state) => state.active);
  if (!active) return null;
  return (
    <>
      <RemoteSelections />
      <RemoteCursors />
      <CursorBroadcaster />
    </>
  );
}
