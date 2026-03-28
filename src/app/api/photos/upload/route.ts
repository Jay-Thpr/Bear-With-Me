import { NextRequest, NextResponse } from "next/server";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

async function getOrCreateAlbum(token: string, title: string): Promise<string> {
  // Search existing albums (up to 50 pages) for a title match
  let pageToken: string | undefined;
  do {
    const url = `https://photoslibrary.googleapis.com/v1/albums?pageSize=50${
      pageToken ? `&pageToken=${pageToken}` : ""
    }`;
    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const match = listData.albums?.find((a: any) => a.title === title);
      if (match) return match.id;
      pageToken = listData.nextPageToken;
    } else {
      break;
    }
  } while (pageToken);

  // Create album
  const createRes = await fetch("https://photoslibrary.googleapis.com/v1/albums", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ album: { title } }),
  });

  if (!createRes.ok) {
    console.error("[photos] Album creation failed:", await createRes.text());
    return "";
  }

  const albumData = await createRes.json();
  return albumData.id ?? "";
}

export async function POST(req: NextRequest) {
  let frameBase64: string, skill: string, label: string, sessionId: string;

  try {
    const body = await req.json();
    frameBase64 = body.frameBase64;
    skill = body.skill?.trim() || "Skill";
    label = body.label?.trim() || "Coaching screenshot";
    sessionId = body.sessionId?.trim() || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!frameBase64) {
    return NextResponse.json({ error: "frameBase64 required" }, { status: 400 });
  }

  const oauthClient = await getUserOAuthClient();
  if (!oauthClient) {
    return NextResponse.json(
      { error: "You must sign in with Google to sync photos." },
      { status: 401 }
    );
  }

  const accessToken = oauthClient.credentials?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token available." }, { status: 401 });
  }

  try {
    const imageBytes = Buffer.from(frameBase64, "base64");

    // Step 1: Upload raw bytes to Google Photos
    const uploadRes = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Content-Type": "image/jpeg",
        "X-Goog-Upload-Protocol": "raw",
      },
      body: imageBytes,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      console.error("[photos] Upload token error:", text);
      return NextResponse.json({ error: `Upload failed: ${uploadRes.status}` }, { status: 500 });
    }

    const uploadToken = await uploadRes.text();

    // Step 2: Create media item with description
    const timestamp = new Date().toLocaleString();
    const description = `${label} — ${skill} session (${timestamp})`;

    const createBody: any = {
      newMediaItems: [
        {
          description,
          simpleMediaItem: { uploadToken },
        },
      ],
    };

    // Build album title: "{skill} / Session {date}" — skill is the exact user input
    const albumTitle = `${skill} / Session ${sessionId}`;
    console.log(`[photos] Looking for album: "${albumTitle}"`);
    const albumId = await getOrCreateAlbum(accessToken, albumTitle);
    console.log(`[photos] Album ID result: "${albumId}"`);
    if (albumId) {
      createBody.albumId = albumId;
    } else {
      console.warn("[photos] No album ID — saving to main library");
    }

    const createRes = await fetch(
      "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createBody),
      }
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[photos] Create item error:", text);
      return NextResponse.json({ error: `Create media item failed: ${createRes.status}` }, { status: 500 });
    }

    const createData = await createRes.json();
    const mediaItem = createData.newMediaItemResults?.[0]?.mediaItem;

    return NextResponse.json({
      success: true,
      photoUrl: mediaItem?.productUrl ?? null,
      description,
    });
  } catch (err: any) {
    console.error("[photos] Unexpected error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Photo sync failed" }, { status: 500 });
  }
}
