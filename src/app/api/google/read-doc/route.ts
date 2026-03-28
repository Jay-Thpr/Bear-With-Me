import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

export async function POST(req: NextRequest) {
  const oauthClient = await getUserOAuthClient();

  if (!oauthClient) {
    return NextResponse.json(
      { error: "You must sign in with Google before reading a doc." },
      { status: 401 }
    );
  }

  let docUrl: string;
  try {
    const body = await req.json();
    docUrl = String(body?.docUrl || "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const documentId = extractDocumentId(docUrl);
  if (!documentId) {
    return NextResponse.json({ error: "Could not parse a Google Doc ID." }, { status: 400 });
  }

  try {
    const docs = google.docs({ version: "v1", auth: oauthClient });
    const res = await docs.documents.get({ documentId });
    const text = extractPlainText(res.data.body?.content ?? []);

    return NextResponse.json({
      success: true,
      title: res.data.title || null,
      documentId,
      text,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to read Google Doc." },
      { status: 500 }
    );
  }
}

function extractDocumentId(docUrl: string): string | null {
  const match = docUrl.match(/\/document\/d\/([^/]+)/);
  return match?.[1] ?? null;
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
    if (block.table?.tableRows) {
      for (const row of block.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          chunks.push(extractPlainText(cell.content ?? []));
        }
      }
    }
    if (block.tableOfContents?.content) {
      chunks.push(extractPlainText(block.tableOfContents.content));
    }
  }

  return chunks.join("").trim();
}
