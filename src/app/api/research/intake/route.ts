import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { ResearchDocRefs, ResearchIntakeDraft } from "../../../../../lib/research-types";
import { appendResearchLogEntry, initializeResearchWorkspace } from "../../../../../lib/research";
import { getUserOAuthClient } from "../../../../../lib/getUserAuth";

const MODEL = "gemini-2.5-flash";

type IntakeMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: NextRequest) {
  let draft: ResearchIntakeDraft;
  let messages: IntakeMessage[];
  let userMessage: string;
  let workspace: ResearchDocRefs | undefined;

  try {
    const body = await req.json();
    draft = body?.draft || {};
    messages = Array.isArray(body?.messages) ? body.messages : [];
    userMessage = String(body?.userMessage || "").trim();
    workspace = body?.workspace || undefined;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!userMessage) {
    return NextResponse.json({ error: "userMessage required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    const fallbackDraft = mergeFallbackDraft(draft, userMessage);
    const nextWorkspace = await ensureWorkspace(fallbackDraft, workspace);
    await appendChatLog(nextWorkspace, `User: ${userMessage}`);
    await appendChatLog(nextWorkspace, `Assistant: ${buildNextAssistantMessage(fallbackDraft, userMessage)}`);
    return NextResponse.json({
      assistantMessage: buildNextAssistantMessage(fallbackDraft, userMessage),
      draft: fallbackDraft,
      readyToResearch: isDraftReady(fallbackDraft),
      missingFields: getMissingFields(fallbackDraft),
      workspace: nextWorkspace,
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `You are extracting structured research intake for a research-first AI coaching app.

Your job:
- read the latest user message
- update the structured research intake draft only
- infer values when the user clearly provided them
- normalize vague language into usable coaching/research fields

Current structured draft:
${JSON.stringify(draft, null, 2)}

Conversation so far:
${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
USER: ${userMessage}

Required structured fields:
- skill
- goal
- level
- preferences
- constraints
- environment
- equipment

Rules:
- infer fields when the user clearly provided them
- if a field is unknown, leave it missing rather than inventing specifics
- level must be one of beginner, intermediate, advanced
- equipment should be an array of strings
- normalize "I just want to learn X" into a minimal goal if needed
- preferences should capture actionable coaching preferences, not abstract learning theory
- constraints should capture time, space, safety, or pace limits if present

Return ONLY valid JSON:
{
  "draft": {
    "skill": "optional string",
    "goal": "optional string",
    "level": "beginner|intermediate|advanced",
    "preferences": "optional string",
    "constraints": "optional string",
    "environment": "optional string",
      "equipment": ["item"]
  }
}`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text || "{}") as { draft?: ResearchIntakeDraft };

    const mergedDraft = {
      ...draft,
      ...(parsed.draft || {}),
      equipment: Array.isArray(parsed.draft?.equipment)
        ? parsed.draft?.equipment.filter(Boolean)
        : draft.equipment,
    };

    const missingFields = getMissingFields(mergedDraft);
    const assistantMessage = buildNextAssistantMessage(mergedDraft, userMessage);
    const nextWorkspace = await ensureWorkspace(mergedDraft, workspace);
    await appendChatLog(nextWorkspace, `User: ${userMessage}`);
    await appendChatLog(nextWorkspace, `Assistant: ${assistantMessage}`);

    return NextResponse.json({
      assistantMessage,
      draft: mergedDraft,
      readyToResearch: missingFields.length === 0,
      missingFields,
      workspace: nextWorkspace,
    });
  } catch (error: any) {
    const fallbackDraft = mergeFallbackDraft(draft, userMessage);
    const assistantMessage = buildNextAssistantMessage(fallbackDraft, userMessage);
    const nextWorkspace = await ensureWorkspace(fallbackDraft, workspace);
    await appendChatLog(nextWorkspace, `User: ${userMessage}`);
    await appendChatLog(nextWorkspace, `Assistant: ${assistantMessage}`);
    return NextResponse.json({
      assistantMessage,
      draft: fallbackDraft,
      readyToResearch: isDraftReady(fallbackDraft),
      missingFields: getMissingFields(fallbackDraft),
      fallback: true,
      error: error?.message || "intake failed",
      workspace: nextWorkspace,
    });
  }
}

function getMissingFields(draft: ResearchIntakeDraft): string[] {
  const missing: string[] = [];
  if (!draft.skill?.trim()) missing.push("skill");
  if (!draft.goal?.trim()) missing.push("goal");
  if (!draft.level) missing.push("level");
  if (!draft.equipment?.length && /jugg|basket|guitar|knife|cook|tennis|golf|soccer|baseball/i.test(draft.skill || "")) {
    missing.push("equipment");
  }
  return missing;
}

function isDraftReady(draft: ResearchIntakeDraft) {
  return getMissingFields(draft).length === 0;
}

function mergeFallbackDraft(draft: ResearchIntakeDraft, userMessage: string): ResearchIntakeDraft {
  const lower = userMessage.toLowerCase();
  return {
    ...draft,
    skill:
      draft.skill ||
      (lower.includes("knife")
        ? "Knife skills"
        : lower.includes("juggl")
          ? "Juggling"
          : draft.skill),
    goal: draft.goal || userMessage,
    level:
      draft.level ||
      (lower.includes("beginner")
        ? "beginner"
        : lower.includes("advanced")
          ? "advanced"
          : lower.includes("intermediate")
            ? "intermediate"
            : undefined),
  };
}

function buildNextAssistantMessage(draft: ResearchIntakeDraft, userMessage: string): string {
  const missing = getMissingFields(draft);
  if (missing.length === 0) {
    return "I have enough to start the research. When you're ready, I can build the coaching model.";
  }

  const next = missing[0];
  const skill = draft.skill?.toLowerCase() || "";
  const normalizedUser = userMessage.trim();

  switch (next) {
    case "skill":
      return "What skill do you want to work on?";
    case "goal":
      if (skill.includes("juggl")) {
        return "What specific juggling milestone are you aiming for first: a basic 3-ball cascade, longer duration, or beginner tricks?";
      }
      if (skill.includes("knife")) {
        return "What specific outcome are you after first: safer technique, basic cuts, speed, or consistency?";
      }
      return "What specific outcome are you aiming for first?";
    case "level":
      return "What level are you at right now: beginner, intermediate, or advanced?";
    case "preferences":
      return "For coaching style, which is closer: short live corrections, step-by-step demos, or a mix of both?";
    case "constraints":
      return "Any constraints I should optimize around, like time limit, available space, pace, or safety concerns?";
    case "environment":
      if (skill.includes("juggl")) {
        return "Will you be practicing indoors or outdoors, and about how much room do you have?";
      }
      return "What environment will you be practicing in?";
    case "equipment":
      if (skill.includes("juggl")) {
        return "What will you be using to practice: juggling balls, tennis balls, beanbags, or something else?";
      }
      return "What equipment or tools are you using?";
    default:
      return normalizedUser ? "Tell me a bit more so I can prepare the research properly." : "What do you want to learn?";
  }
}

async function ensureWorkspace(
  draft: ResearchIntakeDraft,
  workspace?: ResearchDocRefs
): Promise<ResearchDocRefs | undefined> {
  if (workspace?.researchDocId && workspace?.researchLogTabId) {
    return workspace;
  }

  if (!draft.skill?.trim()) {
    return workspace;
  }

  const oauthClient = await getUserOAuthClient().catch(() => null);
  if (!oauthClient) {
    return workspace;
  }

  try {
    const initialized = await initializeResearchWorkspace(draft.skill, oauthClient);
    return {
      ...workspace,
      rootFolderUrl: initialized.rootFolderUrl,
      progressFolderId: initialized.progressFolderId,
      researchDocId: initialized.researchDocId,
      researchDocUrl: initialized.researchDocUrl,
      researchLogTabId: initialized.researchLogTabId,
      finalResearchTabId: initialized.finalResearchTabId,
    };
  } catch {
    return workspace;
  }
}

async function appendChatLog(workspace: ResearchDocRefs | undefined, message: string) {
  if (!workspace?.researchDocId || !workspace.researchLogTabId) return;

  const oauthClient = await getUserOAuthClient().catch(() => null);
  if (!oauthClient) return;

  try {
    await appendResearchLogEntry(
      workspace.researchDocId,
      workspace.researchLogTabId,
      message,
      oauthClient
    );
  } catch {
    // Non-fatal for intake UX.
  }
}
