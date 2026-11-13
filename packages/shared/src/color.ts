/**
 * Cleans up a colour typed by the user. Accepts "#5cc4e0", "5CC4E0" and the short "#fa0" form.
 * Returns the colour as lower-case "#rrggbb", or null if it is not a valid hex colour.
 */
export function normalizeHexColor(text: string): string | null {
  const body = text.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(body)) {
    const [r, g, b] = body;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(body)) return `#${body}`.toLowerCase();
  return null;
}
