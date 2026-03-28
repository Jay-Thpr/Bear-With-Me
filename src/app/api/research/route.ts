import { NextRequest } from "next/server";
import {
  generateSkillIllustration,
} from "../../../../lib/gemini";
import { assembleSystemPrompt } from "../../../../lib/session-context";
import { getUserOAuthClient } from "../../../../lib/getUserAuth";
import {
  buildResearchBrief,
  conductStructuredVideoResearch,
  conductStructuredWebResearch,
  generateClarificationQuestions,
  mapResearchModelToSkillModel,
  parseLearnerProfile,
  persistResearchWorkspace,
  synthesizeResearchModel,
} from "../../../../lib/research";
import type {
  ClarificationAnswer,
  ResearchIntakeInput,
  SkillLevel,
} from "../../../../lib/research-types";

export const runtime = "nodejs"; // Required for SSE

export async function POST(req: NextRequest) {
  let intake: ResearchIntakeInput;
  try {
    const body = await req.json();
    const skill = body?.skill?.trim() || "";
    intake = {
      skill,
      goal: body?.goal?.trim() || `Learn ${skill}`,
      level: (body?.level || "beginner") as SkillLevel,
      preferences: body?.preferences?.trim() || undefined,
      constraints: body?.constraints?.trim() || undefined,
      environment: body?.environment?.trim() || undefined,
      equipment: Array.isArray(body?.equipment)
        ? body.equipment.map((item: unknown) => String(item))
        : undefined,
    };
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  if (!intake.skill) {
    return new Response(JSON.stringify({ error: "skill required" }), { status: 400 });
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: object | string) => {
        const payload = typeof data === "string" ? { message: data } : data;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
        );
      };

      try {
        // Demo fallback
        if (process.env.GLITCH_USE_DEMO_DOC === "true") {
          const { default: demoDoc } = await import("../../../../data/cooking-skill-demo.json");
          emit("status", { message: "Loading demo coaching plan..." });
          await new Promise(r => setTimeout(r, 800));
          emit("done", { skillModel: demoDoc, docUrl: null, systemPrompt: "" });
          controller.close();
          return;
        }

        emit("status", { message: `🔍 Starting research for "${intake.skill}"...` });

        emit("status", { message: "🧾 Parsing learner profile..." });
        const learnerProfile = await parseLearnerProfile(intake);

        const clarificationAnswers = Array.isArray((intake as any).clarificationAnswers)
          ? ((intake as any).clarificationAnswers as ClarificationAnswer[])
          : [];

        emit("status", { message: "❓ Checking whether clarification is needed..." });
        const clarificationQuestions = await generateClarificationQuestions(learnerProfile);
        if (clarificationQuestions.length > 0 && clarificationAnswers.length === 0) {
          emit("clarification_required", { questions: clarificationQuestions });
          emit("status", { message: `❓ ${clarificationQuestions.length} clarification questions identified` });
          controller.close();
          return;
        } else {
          emit("status", { message: "✅ No clarification questions needed" });
        }

        emit("status", { message: "🗺️ Building research brief..." });
        const researchBrief = await buildResearchBrief(learnerProfile, clarificationAnswers);

        const [illustrationUrl, webResearch, videoResearch] = await Promise.all([
          generateSkillIllustration(intake.skill).then(url => {
            emit("status", { message: "🎨 Skill illustration generated" });
            emit("illustration", { url });
            return url;
          }),
          conductStructuredWebResearch(researchBrief).then((result) => {
            const firstFinding = result.findings[0];
            if (firstFinding) {
              emit("status", {
                message: `✅ Web research captured ${firstFinding.properForm.slice(0, 3).length} proper-form signals`,
              });
            }
            return result;
          }),
          conductStructuredVideoResearch(researchBrief, (title) =>
            emit("status", { message: `✅ Analyzed: "${title}"` })
          ).then((result) => {
            emit("status", { message: `📺 Analyzed ${result.videos.length} tutorial videos` });
            return result;
          }),
        ]);

        emit("status", { message: "🧠 Synthesizing research model..." });
        const researchModel = await synthesizeResearchModel(
          researchBrief,
          webResearch.findings,
          videoResearch.videos
        );
        const skillModel = mapResearchModelToSkillModel(researchModel, illustrationUrl);
        emit("status", { message: "✅ Coaching plan ready" });

        emit("status", { message: "📄 Saving research workspace..." });
        let docUrl: string | null = null;
        let progressDocUrl: string | null = null;
        let rootFolderUrl: string | null = null;
        try {
          const oauthClient = await getUserOAuthClient();
          const workspace = await persistResearchWorkspace(
            researchModel,
            clarificationQuestions,
            oauthClient
          );
          docUrl = workspace.researchDocUrl;
          progressDocUrl = workspace.progressDocUrl;
          rootFolderUrl = workspace.rootFolderUrl;
          emit("status", { message: "✅ Saved research and progress docs to Drive" });
        } catch (err: any) {
          if (err?.message !== "NO_CREDENTIALS") {
            console.error("[research] Docs write failed:", err);
          }
        }

        // ── ASSEMBLE SYSTEM PROMPT ──
        const systemPrompt = assembleSystemPrompt(skillModel, null);

        emit("done", {
          skillModel,
          researchModel,
          skillModelJson: JSON.stringify(skillModel),
          systemPrompt,
          docUrl,
          progressDocUrl,
          rootFolderUrl,
        });

      } catch (err) {
        console.error("[research] Pipeline error:", err);
        emit("error", { message: "Research pipeline failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
