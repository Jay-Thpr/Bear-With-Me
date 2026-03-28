import { NextRequest } from "next/server";
import { generateSkillIllustration } from "../../../../lib/gemini";
import { getUserOAuthClient } from "../../../../lib/getUserAuth";
import {
  appendResearchLogBlocks,
  appendResearchLogEntry,
  buildResearchBrief,
  conductStructuredVideoResearch,
  conductStructuredWebResearch,
  finalizeResearchWorkspace,
  initializeResearchWorkspace,
  mapResearchModelToSkillModel,
  parseLearnerProfile,
  synthesizeResearchModel,
  updateLiveResearchWorkspace,
} from "../../../../lib/research";
import type {
  ResearchDocRefs,
  ResearchIntakeInput,
  ResearchRunState,
  SkillLevel,
} from "../../../../lib/research-types";
import { assembleSystemPrompt } from "../../../../lib/session-context";

export const runtime = "nodejs";
const TEMP_DISABLE_RESEARCH = true;

function formatDurationMs(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

type WorkspaceState = {
  rootFolderUrl: string;
  researchDocUrl: string;
  researchDocId: string;
  researchLogTabId: string;
  liveResearchTabId: string;
  finalResearchTabId: string;
  progressFolderId: string;
};

export async function POST(req: NextRequest) {
  let intake: ResearchIntakeInput & { workspace?: ResearchDocRefs };
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
      workspace: body?.workspace,
    };
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  if (!intake.skill) {
    return new Response(JSON.stringify({ error: "skill required" }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const pipelineStartedAt = Date.now();
      let oauthClient: any | null = null;
      let researchLogTarget: { documentId: string; researchLogTabId: string } | null = null;
      let workspaceState: WorkspaceState | null = null;
      let liveRunState: ResearchRunState = {
        stage: "Research queued",
        skill: intake.skill,
        goal: intake.goal,
        level: intake.level,
      };

      const emit = async (type: string, data: object | string) => {
        const payload: Record<string, unknown> =
          typeof data === "string" ? { message: data } : (data as Record<string, unknown>);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));

        if (type === "status" && researchLogTarget && typeof payload.message === "string" && oauthClient) {
          try {
            await appendResearchLogEntry(
              researchLogTarget.documentId,
              researchLogTarget.researchLogTabId,
              payload.message,
              oauthClient
            );
          } catch (error) {
            console.error("[research] Failed to append log entry:", error);
          }
        }
      };

      const appendDetailedLog = async (blocks: Array<{ type: "title" | "heading1" | "heading2" | "paragraph" | "bullets"; text?: string; items?: string[] }>) => {
        if (!researchLogTarget || !oauthClient) return;
        try {
          await appendResearchLogBlocks(
            researchLogTarget.documentId,
            researchLogTarget.researchLogTabId,
            blocks.map((block) => {
              if (block.type === "bullets") {
                return { type: "bullets" as const, items: block.items || [] };
              }
              return { type: block.type, text: block.text || "" } as const;
            }),
            oauthClient
          );
        } catch (error) {
          console.error("[research] Failed to append detailed log blocks:", error);
        }
      };

      const syncLiveResearch = async (patch: Partial<ResearchRunState>) => {
        liveRunState = {
          ...liveRunState,
          ...patch,
        };

        if (!workspaceState || !oauthClient) return;
        try {
          await updateLiveResearchWorkspace(
            workspaceState.researchDocId,
            workspaceState.liveResearchTabId,
            liveRunState,
            oauthClient
          );
        } catch (error) {
          console.error("[research] Failed to update live research tab:", error);
        }
      };

      try {
        if (TEMP_DISABLE_RESEARCH) {
          const mockSkillModel = {
            metadata: {
              skill: intake.skill,
              goal: intake.goal,
              level: intake.level,
            },
            sessionPlan: {
              primaryFocus: `Core ${intake.skill} fundamentals`,
              secondaryFocus: `Build consistency toward: ${intake.goal}`,
              warmupActivity: `Spend 2 minutes resetting your form for ${intake.skill}`,
              keyCheckpoints: [
                "Keep movements controlled and repeatable",
                "Focus on one correction at a time",
                "End the session with one measurable improvement",
              ],
              successIndicators: [
                "Form is more consistent than at the start",
                "You can describe the main correction in plain language",
              ],
            },
          };
          const systemPrompt = assembleSystemPrompt(mockSkillModel as any, null);

          await emit("status", { message: `Skipping research for "${intake.skill}"...` });
          await emit("done", {
            skillModel: mockSkillModel,
            skillModelJson: JSON.stringify(mockSkillModel),
            systemPrompt,
            docUrl: null,
            rootFolderUrl: null,
            totalDuration: "0.0s",
          });
          controller.close();
          return;
        }

        if (process.env.GLITCH_USE_DEMO_DOC === "true") {
          const { default: demoDoc } = await import("../../../../data/cooking-skill-demo.json");
          await emit("status", { message: "Loading demo coaching plan..." });
          await new Promise((resolve) => setTimeout(resolve, 800));
          await emit("done", { skillModel: demoDoc, docUrl: null, systemPrompt: "" });
          controller.close();
          return;
        }

        await emit("status", { message: `🔍 Starting research for "${intake.skill}"...` });

        const workspacePromise = (async () => {
          try {
            oauthClient = await getUserOAuthClient();
            if (!oauthClient) {
              return null;
            }

            if (
              intake.workspace?.researchDocId &&
              intake.workspace?.researchLogTabId &&
              intake.workspace?.liveResearchTabId &&
              intake.workspace?.finalResearchTabId &&
              intake.workspace?.progressFolderId &&
              intake.workspace?.researchDocUrl &&
              intake.workspace?.rootFolderUrl
            ) {
              workspaceState = {
                rootFolderUrl: intake.workspace.rootFolderUrl,
                researchDocUrl: intake.workspace.researchDocUrl,
                researchDocId: intake.workspace.researchDocId,
                researchLogTabId: intake.workspace.researchLogTabId,
                liveResearchTabId: intake.workspace.liveResearchTabId,
                finalResearchTabId: intake.workspace.finalResearchTabId,
                progressFolderId: intake.workspace.progressFolderId,
              };
            } else {
              workspaceState = await initializeResearchWorkspace(intake.skill, oauthClient);
            }

            researchLogTarget = {
              documentId: workspaceState.researchDocId,
              researchLogTabId: workspaceState.researchLogTabId,
            };
            await syncLiveResearch({
              stage: "Workspace ready",
              notes: ["Research workspace initialized and ready for live updates."],
            });
            return workspaceState;
          } catch (error) {
            console.error("[research] Workspace init failed:", error);
            oauthClient = null;
            return null;
          }
        })();

        await emit("status", { message: "🧾 Parsing learner profile..." });
        const learnerProfileStartedAt = Date.now();
        const learnerProfile = await parseLearnerProfile(intake);
        await emit("status", {
          message: `🧾 Learner profile parsed in ${formatDurationMs(learnerProfileStartedAt)}`,
        });
        const initializedWorkspace: WorkspaceState | null = await workspacePromise;

        await syncLiveResearch({
          stage: "Learner profile parsed",
          learnerProfile,
          skill: learnerProfile.skill,
          goal: learnerProfile.goal,
          level: learnerProfile.level,
          notes: ["Learner profile normalized and ready for brief creation."],
        });

        if (initializedWorkspace) {
          await emit("status", { message: "🗂️ Research workspace live in Drive" });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "workspace",
                docUrl: initializedWorkspace.researchDocUrl,
                rootFolderUrl: initializedWorkspace.rootFolderUrl,
              })}\n\n`
            )
          );
        }

        if (initializedWorkspace && oauthClient) {
          await appendDetailedLog(
            [
              { type: "heading2", text: "Learner Intake Snapshot" },
              {
                type: "bullets",
                items: [
                  `Skill: ${learnerProfile.skill}`,
                  `Goal: ${learnerProfile.goal}`,
                  `Level: ${learnerProfile.level}`,
                  `Time available: ${learnerProfile.constraints.timeAvailable}`,
                  `Environment: ${learnerProfile.constraints.environment}`,
                  `Equipment: ${learnerProfile.constraints.equipment.join(", ") || "none specified"}`,
                  `Learning style: ${learnerProfile.preferences.learningStyle}`,
                  `Coaching tone: ${learnerProfile.preferences.coachingTone}`,
                  `Pacing preference: ${learnerProfile.preferences.pacingPreference}`,
                  `Success criteria: ${learnerProfile.successCriteria}`,
                ],
              },
            ]
          );
        }

        await emit("status", { message: "🗺️ Building research brief..." });
        const briefStartedAt = Date.now();
        const researchBrief = await buildResearchBrief(learnerProfile);
        await emit("status", {
          message: `🗺️ Research brief built in ${formatDurationMs(briefStartedAt)}`,
        });

        await syncLiveResearch({
          stage: "Research brief built",
          goal: researchBrief.goal,
          level: researchBrief.level,
          domain: researchBrief.domain,
          priorityAreas: researchBrief.priorityAreas,
          notes: researchBrief.teachingImplications,
        });

        if (initializedWorkspace && oauthClient) {
          await appendDetailedLog(
            [
              { type: "heading2", text: "Research Brief" },
              {
                type: "paragraph",
                text: `Research is targeting ${researchBrief.goal} for a ${researchBrief.level} learner.`,
              },
              { type: "heading2", text: "Priority Areas" },
              { type: "bullets", items: researchBrief.priorityAreas },
              { type: "heading2", text: "Source Selection Guidance" },
              { type: "bullets", items: researchBrief.sourceSelectionGuidance },
              { type: "heading2", text: "Teaching Implications" },
              { type: "bullets", items: researchBrief.teachingImplications },
            ]
          );
        }

        const retrievalStartedAt = Date.now();
        const [illustrationUrl, webResearch, videoResearch] = await Promise.all([
          generateSkillIllustration(intake.skill).then((url) => {
            void emit("status", { message: "🎨 Skill illustration generated" });
            void emit("illustration", { url });
            return url;
          }),
          conductStructuredWebResearch(researchBrief).then((result) => {
            void emit("status", {
              message: `🌐 Reviewed ${result.sources.length || result.findings.length} grounded web sources and kept ${result.stats.evidenceUnitsCollected} evidence units in ${formatDurationMs(retrievalStartedAt)}`,
            });
            void syncLiveResearch({
              stage: "Web retrieval complete",
              domain: researchBrief.domain,
              sourceCount: result.sources.length,
              evidenceCounts: result.findings.reduce<Record<string, number>>((acc, finding) => {
                for (const [key, value] of Object.entries({
                  proper_form: finding.properForm.length,
                  mistake: finding.commonMistakes.length,
                  progression: finding.progressionSteps.length,
                  drill: finding.drills.length,
                  safety: finding.safetyNotes.length,
                })) {
                  acc[key] = (acc[key] || 0) + value;
                }
                return acc;
              }, {}),
              discardedEvidenceCount: result.stats.evidenceUnitsDiscarded,
              properFormSignals: result.findings.flatMap((finding) => finding.properForm).slice(0, 6),
              commonMistakes: result.findings.flatMap((finding) => finding.commonMistakes).slice(0, 6),
              drills: result.findings.flatMap((finding) => finding.drills).slice(0, 6),
              progression: result.findings.flatMap((finding) => finding.progressionSteps).slice(0, 6),
              openQuestions: result.findings.flatMap((finding) => finding.openQuestions || []).slice(0, 6),
              contradictions: result.findings.flatMap((finding) => finding.contradictions || []).slice(0, 6),
              passSummaries: result.stats.passSummaries,
              notes: ["Grounded web evidence collected and normalized."],
            });
            void appendDetailedLog([
              { type: "heading2", text: "Live Web Retrieval" },
              {
                type: "bullets",
                items: result.sources.length > 0
                  ? result.sources.map((source) => `${source.title}: ${source.url}`)
                  : ["No grounded web sources were returned."],
              },
              { type: "heading2", text: "Web Retrieval Metrics" },
              {
                type: "bullets",
                items: [
                  `Passes succeeded: ${result.stats.passesSucceeded}/${result.stats.passesAttempted}`,
                  `Evidence kept: ${result.stats.evidenceUnitsCollected}`,
                  `Evidence discarded: ${result.stats.evidenceUnitsDiscarded}`,
                  ...result.stats.passSummaries.map(
                    (pass) =>
                      `${pass.focus}: ${pass.status} in ${(pass.durationMs / 1000).toFixed(1)}s, kept ${pass.findings}, discarded ${pass.discarded}${
                        pass.reason ? `, reason: ${pass.reason}` : ""
                      }`
                  ),
                ],
              },
            ]);
            return result;
          }),
          conductStructuredVideoResearch(researchBrief, (title) =>
            Promise.all([
              emit("status", { message: `🎬 Collected tutorial reference: "${title}"` }),
              appendDetailedLog([
                { type: "heading2", text: "Tutorial Reference Captured" },
                { type: "paragraph", text: title },
              ]),
            ]).then(() => undefined)
          ).then((result) => {
            void emit("status", {
              message: `📺 Captured ${result.videos.length} tutorial references in ${formatDurationMs(retrievalStartedAt)}`,
            });
            void syncLiveResearch({
              stage: "Tutorial enrichment complete",
              tutorialReferenceCount: result.videos.length,
              notes: ["Tutorial references captured as optional learner enrichment."],
            });
            return result;
          }),
        ]);

        if (initializedWorkspace && oauthClient) {
          await appendDetailedLog(
            [
              { type: "heading2", text: "Web Research Findings" },
              ...webResearch.findings.flatMap((finding) => [
                { type: "paragraph" as const, text: `${finding.title}: ${finding.summary}` },
                {
                  type: "bullets" as const,
                  items: [
                    ...finding.properForm.map((item) => `Proper form: ${item}`),
                    ...finding.commonMistakes.map((item) => `Common mistake: ${item}`),
                    ...finding.progressionSteps.map((item) => `Progression step: ${item}`),
                    ...finding.safetyNotes.map((item) => `Safety note: ${item}`),
                  ],
                },
              ]),
              { type: "heading2", text: "Web Sources" },
              {
                type: "bullets",
                items:
                  webResearch.sources.map((source) => `${source.title}: ${source.url}`) || [
                    "No grounded web sources captured.",
                  ],
              },
              { type: "heading2", text: "Video Research Findings" },
              ...videoResearch.videos.flatMap((video) => [
                { type: "paragraph" as const, text: `${video.title}: ${video.summary}` },
                {
                  type: "bullets" as const,
                  items: [
                    `URL: ${video.url}`,
                    ...(video.techniques.length > 0 ? video.techniques.map((item) => `Technique: ${item}`) : []),
                    ...(video.mistakes.length > 0 ? video.mistakes.map((item) => `Mistake shown: ${item}`) : []),
                    ...(video.bestMoments.length > 0
                      ? video.bestMoments.map(
                          (moment) =>
                            `Reference ${moment.timestamp}: ${moment.description} (${moment.useCase})`
                        )
                      : ["Used as lightweight tutorial enrichment only."]),
                  ],
                },
              ]),
              { type: "heading2", text: "Research Architecture Note" },
              {
                type: "paragraph",
                text: "This run used web-grounded evidence as the primary structured coaching source. YouTube links were captured as lightweight tutorial references, not deep parsed evidence.",
              },
            ]
          );
        }

        await emit("status", { message: "🧠 Synthesizing research model..." });
        const synthesisStartedAt = Date.now();
        const researchModel = await synthesizeResearchModel(
          researchBrief,
          webResearch.findings,
          videoResearch.videos,
          webResearch.sources
        );
        await syncLiveResearch({
          ...liveRunState,
          stage: "Research synthesized",
          domain: researchBrief.domain,
          sourceCount: webResearch.sources.length,
          tutorialReferenceCount: videoResearch.videos.length,
          evidenceCounts: researchModel.researchQuality.evidenceCounts,
          discardedEvidenceCount: researchModel.researchQuality.discardedEvidenceCount,
          gateFailures: researchModel.researchQuality.gateFailures,
          properFormSignals: researchModel.properFormSignals.map((item) => item.observableCue).slice(0, 6),
          commonMistakes: researchModel.commonMistakes.map((item) => item.issue).slice(0, 6),
          drills: researchModel.beginnerDrills.map((item) => item.name).slice(0, 6),
          progression: researchModel.progressionStages.map((item) => item.stageGoal).slice(0, 6),
          openQuestions: researchModel.openQuestions.slice(0, 6),
          notes: [
            `Quality score: ${researchModel.researchQuality.score}`,
            ...researchModel.researchQuality.notes.slice(0, 4),
          ],
        });
        const skillModel = mapResearchModelToSkillModel(researchModel, illustrationUrl);
        await emit("status", {
          message: `✅ Coaching plan ready in ${formatDurationMs(synthesisStartedAt)} — ${researchModel.researchQuality.score < 50 ? "Fallback mode (limited sources)" : `quality score ${researchModel.researchQuality.score}`}`,
        });

        if (initializedWorkspace && oauthClient) {
          await appendDetailedLog(
            [
              { type: "heading2", text: "Synthesis Output" },
              { type: "paragraph", text: `Primary focus: ${researchModel.sessionPlan.primaryFocus}` },
              { type: "heading2", text: "Research Quality" },
              {
                type: "bullets",
                items: [
                  `Score: ${researchModel.researchQuality.score}`,
                  `Discarded evidence: ${researchModel.researchQuality.discardedEvidenceCount}`,
                  `Gate failures: ${researchModel.researchQuality.gateFailures.join(", ") || "none"}`,
                  `Repaired sections: ${researchModel.researchQuality.repairedSections.join(", ") || "none"}`,
                ],
              },
              { type: "heading2", text: "Session Checkpoints" },
              { type: "bullets", items: researchModel.sessionPlan.checkpoints },
              { type: "heading2", text: "Observed Proper Form Signals" },
              {
                type: "bullets",
                items: Object.entries(researchModel.properForm).map(([key, value]) => `${key}: ${value}`),
              },
              { type: "heading2", text: "Common Mistakes To Watch" },
              {
                type: "bullets",
                items: researchModel.commonMistakes.map(
                  (mistake) => `${mistake.issue}: ${mistake.correction}`
                ),
              },
            ]
          );
        }

        await emit("status", { message: "📄 Saving research workspace..." });
        const saveStartedAt = Date.now();
        let docUrl: string | null = null;
        let progressDocUrl: string | null = null;
        let rootFolderUrl: string | null = null;

        try {
          if (oauthClient && initializedWorkspace) {
            const finalized = await finalizeResearchWorkspace(
              researchModel,
              [],
              oauthClient,
              initializedWorkspace.researchDocId,
              initializedWorkspace.liveResearchTabId,
              initializedWorkspace.finalResearchTabId,
              initializedWorkspace.progressFolderId
            );
            docUrl = initializedWorkspace.researchDocUrl;
            progressDocUrl = finalized.progressDocUrl;
            rootFolderUrl = initializedWorkspace.rootFolderUrl;
          }
          await emit("status", {
            message: `✅ Saved research and progress docs to Drive in ${formatDurationMs(saveStartedAt)}`,
          });
        } catch (error: any) {
          if (error?.message !== "NO_CREDENTIALS") {
            console.error("[research] Docs write failed:", error);
          }
        }

        const systemPrompt = assembleSystemPrompt(skillModel, null);

        await emit("done", {
          skillModel,
          researchModel,
          skillModelJson: JSON.stringify(skillModel),
          systemPrompt,
          docUrl,
          progressDocUrl,
          rootFolderUrl,
          totalDuration: formatDurationMs(pipelineStartedAt),
        });
      } catch (error) {
        console.error("[research] Pipeline error:", error);
        await emit("error", { message: "Research pipeline failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
