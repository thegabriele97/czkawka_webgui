/** DATA_ROOT is just the mount point inside the container (e.g. "/data") -
 * an implementation detail, not something worth showing the user. Strips
 * it off any absolute path coming back from the backend. */
export function displayPath(path: string, dataRoot: string): string {
  if (!dataRoot) return path;
  if (path === dataRoot) return "/";
  if (path.startsWith(`${dataRoot}/`)) return path.slice(dataRoot.length + 1);
  return path;
}
