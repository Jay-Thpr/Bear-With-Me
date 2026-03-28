import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Uses the image-capable Gemini model to generate a reference image showing
// the ideal execution of the skill, so the user can compare against their current form.

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-2.0-flash-exp";

function buildPrompt(skill: string): string {
  return `This photo shows a student currently practicing "${skill}".

Generate a NEW reference photo showing a person performing "${skill}" with PERFECT form and technique — this is the ideal end-state the student should aim for.

Requirements for the generated reference image:
- Show a person at the same phase of the movement as the student in the photo (match the moment/angle)
- Depict flawless, textbook-perfect execution of "${skill}"
- Same camera angle and framing as the input photo so the student can directly compare
- Clean, clear image — no text overlays, no annotations, no arrows
- The person in the reference should look confident and correct

The student will hold this reference image next to their live camera feed to compare their current form to the ideal.`;
}

export async function POST(req: NextRequest) {
  let frameBase64: string, skill: string;

  try {
    const body = await req.json();
    frameBase64 = body.frameBase64;
    skill = body.skill?.trim() || "this skill";
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!frameBase64) {
    return NextResponse.json({ error: "frameBase64 required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ imageUrl: null, fallback: true, message: "GEMINI_API_KEY not set" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    console.log(`[annotate] Generating reference image for "${skill}" with model ${IMAGE_MODEL}`);

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [
        { inlineData: { mimeType: "image/jpeg", data: frameBase64 } },
        { text: buildPrompt(skill) },
      ],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
        const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        console.log("[annotate] Reference image generated successfully");
        return NextResponse.json({ imageUrl, fallback: false });
      }
    }

    console.warn("[annotate] Model responded but returned no image part");
    return NextResponse.json({ imageUrl: null, fallback: true, message: "No image in response" });
  } catch (err: any) {
    console.error("[annotate] Error:", err?.message || err);
    return NextResponse.json({ imageUrl: null, fallback: true, message: err?.message || "Annotation failed" });
  }
}
