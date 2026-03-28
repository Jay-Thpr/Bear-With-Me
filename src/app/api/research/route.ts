import { NextRequest, NextResponse } from "next/server";
import { findTutorialUrls, analyzeSkillVideos, synthesizeSkillDoc } from "../../../../lib/gemini";
import { createSkillDoc } from "../../../../lib/google-docs";
import demoDoc from "../../../../data/cooking-skill-demo.json";

export async function POST(req: NextRequest) {
  // Parse and validate request body
  let skill: string;
  try {
    const body = await req.json();
    skill = body?.skill?.trim();
  } catch {
    return NextResponse.json({ error: "skill required" }, { status: 400 });
  }

  if (!skill) {
    return NextResponse.json({ error: "skill required" }, { status: 400 });
  }

  // Demo fallback mode — skip Gemini pipeline, return pre-computed cooking doc
  // Activate by setting GLITCH_USE_DEMO_DOC=true in .env.local
  // TODO: Remove demo mode once GEMINI_API_KEY and Google service account are configured
  if (process.env.GLITCH_USE_DEMO_DOC === "true") {
    console.log("[research] Demo mode: returning pre-computed cooking skill doc");
    const demoContent = JSON.stringify(demoDoc, null, 2);
    try {
      // TODO: createSkillDoc will write to real Google Docs once GOOGLE_SERVICE_ACCOUNT_KEY is set
      const docUrl = await createSkillDoc(`${skill} — Skill Model (Demo)`, demoContent);
      return NextResponse.json({ success: true, docUrl, skillDoc: demoContent });
    } catch (err) {
      console.error("[research] Demo mode Docs write failed:", err);
      // Return demo content even if Docs write fails — still useful for dev
      return NextResponse.json({
        success: true,
        docUrl: null,
        skillDoc: demoContent,
        warning: "Demo mode active — Docs write failed, returning JSON directly",
      });
    }
  }

  // Full pipeline: three-step Gemini flow → Google Docs write
  try {
    // Step 1: Find YouTube tutorial URLs via search grounding
    // TODO: Requires GEMINI_API_KEY in .env.local — returns mock data until then
    console.log(`[research] Step 1: Finding tutorials for "${skill}"`);
    const videoUrls = await findTutorialUrls(skill);

    // Step 2: Analyze video content for coaching data
    // TODO: Requires GEMINI_API_KEY in .env.local — returns mock data until then
    console.log(`[research] Step 2: Analyzing ${videoUrls.length} videos`);
    const rawAnalysis = await analyzeSkillVideos(skill, videoUrls);

    // Step 3: Synthesize into structured skill document
    // TODO: Requires GEMINI_API_KEY in .env.local — returns mock data until then
    console.log(`[research] Step 3: Synthesizing skill document`);
    const skillDoc = await synthesizeSkillDoc(skill, rawAnalysis);

    // Step 4: Write to Google Docs (skipped gracefully if no credentials)
    console.log(`[research] Step 4: Writing to Google Docs`);
    let docUrl: string | null = null;
    try {
      docUrl = await createSkillDoc(`${skill} — Skill Model`, skillDoc);
    } catch (err: any) {
      if (err?.message !== "NO_CREDENTIALS") throw err;
      console.log("[research] No Google credentials — skipping Docs write");
    }

    console.log(`[research] Complete. Doc URL: ${docUrl}`);
    return NextResponse.json({ success: true, docUrl, skillDoc });
  } catch (err) {
    console.error("[research] Pipeline error:", err);
    return NextResponse.json(
      { error: "Research pipeline failed" },
      { status: 500 }
    );
  }
}
