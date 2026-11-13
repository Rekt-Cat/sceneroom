import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { ImportError, importGlbFile } from "./loadModel";

/**
 * Imports files the user picked or dropped: checks the first, puts it in the scene, and tells the user
 * what happened (success or a clear reason for failing) in the bar over the 3D view.
 * Only one file is imported at a time; extra files in a drop are mentioned and skipped.
 */
export async function importFiles(files: readonly File[]): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy || files.length === 0) return;

  const [file] = files;
  if (!file) return;
  setBusy(true);
  setMessage(null);
  try {
    const info = await importGlbFile(file);
    useSceneStore.getState().importModel(info);
    const extra =
      files.length > 1
        ? ` Only the first of ${files.length} files was imported; drop the others one at a time.`
        : "";
    setMessage({
      tone: "info",
      text: `Imported "${info.name}" (${info.triangles.toLocaleString("en-US")} triangles).${extra}`,
    });
  } catch (error) {
    if (error instanceof ImportError) {
      setMessage({ tone: "error", text: error.message });
    } else {
      // Something we did not expect: keep the details in the console for debugging
      console.error("Import failed:", error);
      setMessage({
        tone: "error",
        text: "Something went wrong while importing this file. Please try another file.",
      });
    }
  } finally {
    setBusy(false);
  }
}
