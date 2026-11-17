import EditorShell from "@/components/viewport/EditorShell";

/** The editor for one project; the id in the address says which. */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorShell projectId={projectId} />;
}
