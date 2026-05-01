import { requestUploadUrl } from "@workspace/api-client-react";

export interface UploadResult {
  objectPath: string;
  publicUrl: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const { uploadURL, objectPath } = await requestUploadUrl({
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  });

  const putResp = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`);
  }

  return {
    objectPath,
    publicUrl: objectPathToUrl(objectPath),
  };
}

export function objectPathToUrl(objectPath: string | null | undefined): string {
  if (!objectPath) return "";
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://"))
    return objectPath;
  if (objectPath.startsWith("/api/")) return objectPath;
  if (objectPath.startsWith("/objects/")) return `/api/storage${objectPath}`;
  return objectPath;
}
