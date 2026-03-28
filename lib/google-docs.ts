import { google } from "googleapis";
import { buildAuth } from "./auth";
import { moveFileToFolder } from "./google-drive";
import type { SessionSummary } from "./post-session";

const DOCS_INSERT_CHUNK_SIZE = 10_000; // Stay under Docs API batchUpdate size limit

export type StructuredDocBlock =
  | { type: "title"; text: string }
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

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
export async function createSkillDoc(title: string, content: string, auth?: any): Promise<string> {
  // Skip Docs write if no credentials configured — return null signal
  if (!auth && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("NO_CREDENTIALS");
  }

  const resolvedAuth = buildAuth(auth ?? null);
  const docs = google.docs({ version: "v1", auth: resolvedAuth });
  const drive = google.drive({ version: "v3", auth: resolvedAuth });

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

/**
 * Appends a session summary section to an existing skill doc.
 * Creates a new doc if no docId is provided.
 */
export async function appendSessionSummary(
  title: string,
  summary: SessionSummary,
  existingDocId?: string,
  auth?: any
): Promise<string> {
  if (!auth && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("NO_CREDENTIALS");
  }

  const resolvedAuth = buildAuth(auth ?? null);
  const docs = google.docs({ version: "v1", auth: resolvedAuth });

  const sectionText = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION ${summary.sessionNumber} - ${summary.date} - ${summary.duration}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE FOCUSED ON
${summary.whatWeFocused.map((focus) => `• ${focus}`).join("\n")}

WHAT IMPROVED
${summary.whatImproved.map((item) => `✓ ${item.area}: ${item.evidence}`).join("\n")}

NEEDS WORK
${summary.needsWork.map((item) => `[${item.priority.toUpperCase()}] ${item.area}`).join("\n")}

SKILLS MASTERED THIS SESSION: ${summary.skillsMastered}

NEXT SESSION FOCUS
${summary.recommendedNextFocus}

COACH NOTES
${summary.coachingNotes}

USER MODEL UPDATED
Mastered: ${summary.updatedUserModel.mastered.join(", ") || "none yet"}
Improving: ${summary.updatedUserModel.improving.map((item) => item.area).join(", ") || "none"}
Still needs work: ${summary.updatedUserModel.needsWork.map((item) => item.area).join(", ") || "none"}
`;

  let docId = existingDocId;

  if (!docId) {
    try {
      const createRes = await docs.documents.create({
        requestBody: { title },
      });
      docId = createRes.data.documentId ?? undefined;
    } catch (error) {
      throw error;
    }
  }

  if (!docId) {
    throw new Error("Docs API did not return a documentId");
  }

  let endIndex = 1;

  try {
    const docRes = await docs.documents.get({ documentId: docId });
    endIndex = docRes.data.body?.content?.slice(-1)[0]?.endIndex ?? 1;
  } catch (error) {
    throw error;
  }

  try {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: Math.max(1, endIndex - 1) },
              text: sectionText,
            },
          },
        ],
      },
    });
  } catch (error) {
    throw error;
  }

  return `https://docs.google.com/document/d/${docId}`;
}

export async function createStructuredDoc(
  title: string,
  blocks: StructuredDocBlock[],
  auth?: any,
  parentFolderId?: string
): Promise<{ documentId: string; url: string }> {
  const resolvedAuth = buildAuth(auth ?? null);
  const docs = google.docs({ version: "v1", auth: resolvedAuth });

  const createRes = await docs.documents.create({
    requestBody: { title },
  });

  const documentId = createRes.data.documentId;
  if (!documentId) {
    throw new Error("Docs API did not return a documentId");
  }

  if (parentFolderId) {
    await moveFileToFolder(documentId, parentFolderId, resolvedAuth);
  }

  const requests = buildStructuredDocRequests(blocks, 1);
  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  }

  return {
    documentId,
    url: `https://docs.google.com/document/d/${documentId}`,
  };
}

export async function appendStructuredDocContent(
  documentId: string,
  blocks: StructuredDocBlock[],
  auth?: any
): Promise<void> {
  const resolvedAuth = buildAuth(auth ?? null);
  const docs = google.docs({ version: "v1", auth: resolvedAuth });

  const docRes = await docs.documents.get({ documentId });
  const endIndex = docRes.data.body?.content?.slice(-1)[0]?.endIndex ?? 1;
  const insertIndex = Math.max(1, endIndex - 1);
  const requests = buildStructuredDocRequests(blocks, insertIndex);

  if (requests.length === 0) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

function buildStructuredDocRequests(
  blocks: StructuredDocBlock[],
  insertIndex: number
): any[] {
  const normalizedBlocks = blocks.flatMap((block) => {
    if (block.type === "bullets" && block.items.length === 0) {
      return [];
    }
    if ("text" in block && !block.text.trim()) {
      return [];
    }
    return [block];
  });

  if (normalizedBlocks.length === 0) {
    return [];
  }

  let cursor = insertIndex;
  let fullText = "";
  const trailingRequests: any[] = [];

  for (const block of normalizedBlocks) {
    if (block.type === "bullets") {
      const bulletStart = cursor;
      const bulletText = block.items.map((item) => `${item}\n`).join("");
      fullText += bulletText + "\n";
      cursor += bulletText.length + 1;

      trailingRequests.push({
        createParagraphBullets: {
          range: {
            startIndex: bulletStart,
            endIndex: bulletStart + bulletText.length,
          },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
      continue;
    }

    const text = `${block.text}\n\n`;
    const startIndex = cursor;
    const endIndex = startIndex + block.text.length;
    fullText += text;
    cursor += text.length;

    const namedStyleType =
      block.type === "title"
        ? "TITLE"
        : block.type === "heading1"
          ? "HEADING_1"
          : block.type === "heading2"
            ? "HEADING_2"
            : "NORMAL_TEXT";

    trailingRequests.push({
      updateParagraphStyle: {
        range: {
          startIndex,
          endIndex,
        },
        paragraphStyle: {
          namedStyleType,
        },
        fields: "namedStyleType",
      },
    });
  }

  return [
    {
      insertText: {
        location: { index: insertIndex },
        text: fullText,
      },
    },
    ...trailingRequests,
  ];
}
