import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createStructuredDoc, appendStructuredDocContent } from "../../../../../lib/google-docs";
import { createDriveFolder } from "../../../../../lib/google-drive";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

export async function POST() {
  const oauthClient = await getUserOAuthClient();

  if (!oauthClient) {
    return NextResponse.json(
      { error: "You must sign in with Google before generating workspace docs." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    const stamp = now.toLocaleString();

    const rootFolder = await createDriveFolder(`Glitch Workspace Test - ${stamp}`, undefined, oauthClient);
    const researchFolder = await createDriveFolder("Research", rootFolder.id, oauthClient);
    const progressFolder = await createDriveFolder("Progress", rootFolder.id, oauthClient);

    const researchDoc = await createStructuredDoc(
      "Knife Skills Research Brief",
      [
        { type: "title", text: "Knife Skills Research Brief" },
        { type: "paragraph", text: "A structured research note generated through the Glitch Google Workspace test flow." },
        { type: "heading1", text: "User Preferences" },
        {
          type: "bullets",
          items: [
            "Learns best from visual examples and short verbal corrections",
            "Prefers a calm coaching tone over rapid-fire feedback",
            "Wants 10-minute focused practice blocks",
            "Primary goal: safer, more consistent rocking cuts",
          ],
        },
        { type: "heading1", text: "Research Inputs" },
        {
          type: "bullets",
          items: [
            "YouTube tutorial references on knife grip, wrist pivot, and board contact",
            "Observable proper-form descriptions suitable for camera-based coaching",
            "Common mistakes prioritized by severity and coachability",
          ],
        },
        { type: "heading1", text: "Coaching Strategy" },
        {
          type: "paragraph",
          text: "Start with grip and blade contact. Escalate from short verbal correction to visual annotation when spatial errors repeat. Keep corrections specific and limited to one at a time.",
        },
      ],
      oauthClient,
      researchFolder.id
    );

    const progressDoc = await createStructuredDoc(
      "Knife Skills Progress Tracker",
      [
        { type: "title", text: "Knife Skills Progress Tracker" },
        { type: "paragraph", text: "A formatted progress document for tracking coaching outcomes over repeated sessions." },
        { type: "heading1", text: "Current Status" },
        {
          type: "bullets",
          items: [
            "Grip consistency: improving",
            "Blade-tip contact: improving",
            "Guide-hand safety: needs reinforcement",
          ],
        },
        { type: "heading1", text: "Next Focus" },
        {
          type: "paragraph",
          text: "Improve rhythm and maintain even cut size without lifting the blade too high.",
        },
      ],
      oauthClient,
      progressFolder.id
    );

    await appendStructuredDocContent(
      progressDoc.documentId,
      [
        { type: "heading2", text: "Session Update" },
        {
          type: "bullets",
          items: [
            "Session 1: basic mechanics established",
            "Session 2: more stable wrist pivot observed",
            "Session 3 target: speed without sacrificing uniformity",
          ],
        },
      ],
      oauthClient
    );

    const docs = google.docs({ version: "v1", auth: oauthClient });
    const readBack = await docs.documents.get({ documentId: researchDoc.documentId });

    return NextResponse.json({
      success: true,
      rootFolderUrl: rootFolder.url,
      researchFolderUrl: researchFolder.url,
      progressFolderUrl: progressFolder.url,
      researchDocUrl: researchDoc.url,
      progressDocUrl: progressDoc.url,
      researchDocPreview: extractPlainText(readBack.data.body?.content ?? []),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Workspace document generation failed." },
      { status: 500 }
    );
  }
}

function extractPlainText(content: any[]): string {
  const chunks: string[] = [];

  for (const block of content) {
    if (block.paragraph?.elements) {
      for (const element of block.paragraph.elements) {
        if (element.textRun?.content) {
          chunks.push(element.textRun.content);
        }
      }
    }
  }

  return chunks.join("").trim();
}
