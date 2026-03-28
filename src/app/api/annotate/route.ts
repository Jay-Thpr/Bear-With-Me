import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

function buildAnnotationPrompt(correction: string, bodyPart: string): string {
  return `You are a coaching AI. This is a real photo of a student practicing a skill.

Draw directly on this image to show them how to correct their technique:

CORRECTION NEEDED: ${correction}
FOCUS AREA: ${bodyPart || "the relevant body part or tool"}

Drawing instructions:
1. Draw a BRIGHT RED CIRCLE around the problem area (where the technique is currently wrong)
2. Draw a GREEN ARROW or indicator showing the correct position or direction of movement
3. Add a SHORT TEXT LABEL (2-5 words) in white text with a dark background explaining the correction
4. If there is an ideal position to show, draw a DASHED GREEN OUTLINE showing where the body part should be

Keep annotations minimal and clear — this will be viewed on a small screen during live practice.
Do NOT cover the student's face.
Do NOT add any coaching text outside the image — just the visual annotations on the image itself.

Return the annotated image.`;
}

export async function POST(req: NextRequest) {
  let frameBase64: string, correction: string, bodyPart: string;

  try {
    const body = await req.json();
    frameBase64 = body.frameBase64;
    correction = body.correction?.trim();
    bodyPart = body.bodyPart?.trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!frameBase64 || !correction) {
    return NextResponse.json({ error: "frameBase64 and correction required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    // Dev fallback — return a placeholder so the UI flow can be tested
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: `GEMINI_API_KEY not set — annotation skipped. Correction: ${correction}`,
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const annotationPrompt = buildAnnotationPrompt(correction, bodyPart);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: frameBase64,
          },
        },
        { text: annotationPrompt },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // Extract the generated image from the response parts
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
        const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        return NextResponse.json({ imageUrl, fallback: false });
      }
    }

    // Model responded but without an image
    console.warn("[annotate] Gemini returned no image in response");
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: "Annotation generation returned no image",
    });
  } catch (err: any) {
    console.error("[annotate] Generation error:", err?.message || err);
    // Non-fatal — the coach will narrate instead
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: err?.message || "Annotation failed",
    });
  }
}
