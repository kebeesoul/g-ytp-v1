export function getWorkspaceFileUrl(relativePath: string): string {
  return `/api/workspace-file/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}
