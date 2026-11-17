"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { makeThumbnail, setThumbnailSource } from "./thumbnail";

/**
 * Lets the rest of the app take a picture of the 3D view (for the project's card on the home screen). The view is
 * drawn once more right before the picture is read, because a canvas that was just shown is not readable
 * afterwards unless it is drawn again in the same moment. Lives inside the Canvas and renders nothing.
 */
export default function ThumbnailSource() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    setThumbnailSource(() => {
      const { gl, scene, camera } = get();
      gl.render(scene, camera);
      return makeThumbnail(gl.domElement);
    });
    return () => setThumbnailSource(null);
  }, [get]);
  return null;
}
