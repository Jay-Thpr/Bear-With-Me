import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

const DOCS_INSERT_CHUNK_SIZE = 10_000; // Stay under Docs API batchUpdate size limit

/**
 * Creates a new Google Doc with the given title, writes the content, and
 * optionally moves it to a Drive folder (GOOGLE_DRIVE_FOLDER_ID env var).
 *
 * Returns the full Google Docs URL: "https://docs.google.com/document/d/{docId}"
 *
 * IMPORTANT: insertText uses index 1 (not 0) — index 0 is reserved (before the
 * paragraph end marker) and throws "Invalid index" from the Docs API.
 *
 * TODO: Ensure the service account has Editor access to the target Drive folder.
 *   Set GOOGLE_DRIVE_FOLDER_ID=<folder-id> in .env.local to enable folder placement.
 */
export async function createSkillDoc(title: string, content: string): Promise<string> {
  // Skip Docs write if no credentials configured — return null signal
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("NO_CREDENTIALS");
  }

  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  // Step 1: Create empty document
  const createRes = await docs.documents.create({
    requestBody: { title },
  });
  const docId = createRes.data.documentId;
  if (!docId) throw new Error("Docs API did not return a documentId");

  // Step 2: Optionally move to shared Drive folder
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (folderId) {
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      requestBody: {},
    });
  }

  // Step 3: Write content in chunks (Docs API has a batchUpdate request size limit)
  // Insert in REVERSE order so index 1 always lands at the top of the document.
  const chunks = chunkText(content, DOCS_INSERT_CHUNK_SIZE);

  for (const chunk of [...chunks].reverse()) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: chunk,
            },
          },
        ],
      },
    });
  }

  return `https://docs.google.com/document/d/${docId}`;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
