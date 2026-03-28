import { google } from "googleapis";
import { buildAuth } from "./auth";

export async function createDriveFolder(
  name: string,
  parentFolderId?: string,
  auth?: any
): Promise<{ id: string; url: string }> {
  const resolvedAuth = buildAuth(auth ?? null);
  const drive = google.drive({ version: "v3", auth: resolvedAuth });

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    },
    fields: "id",
  });

  const id = res.data.id;
  if (!id) {
    throw new Error("Drive API did not return a folder ID");
  }

  return {
    id,
    url: `https://drive.google.com/drive/folders/${id}`,
  };
}

export async function moveFileToFolder(
  fileId: string,
  folderId: string,
  auth?: any
): Promise<void> {
  const resolvedAuth = buildAuth(auth ?? null);
  const drive = google.drive({ version: "v3", auth: resolvedAuth });

  await drive.files.update({
    fileId,
    addParents: folderId,
    fields: "id",
    requestBody: {},
  });
}
