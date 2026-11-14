/** Hands bytes to the browser as a file download. */
export function download(name: string, bytes: Uint8Array | ArrayBuffer): void {
  // A copy into a plain ArrayBuffer: that is what a Blob takes
  const blob = new Blob(
    [bytes instanceof Uint8Array ? bytes.slice().buffer : bytes],
    {
      type: "application/octet-stream",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a little later: some browsers need the address for a moment after the click
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
