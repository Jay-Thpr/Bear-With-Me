/**
 * Internal pipeline test — runs parseLearnerProfile → buildResearchBrief
 * → conductStructuredWebResearch → synthesizeResearchModel and dumps
 * the full output for structural analysis.
 *
 * Usage: node --import tsx/esm scripts/test-pipeline.ts
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local before any imports that need env vars
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import {
  parseLearnerProfile,
  buildResearchBrief,
  conductStructuredWebResearch,
  conductStructuredVideoResearch,
  synthesizeResearchModel,
} from "../lib/research.js";
import type { ResearchIntakeInput } from "../lib/research-types.js";

const SKILL = "Juggling";

const intake: ResearchIntakeInput = {
  skill: SKILL,
  goal: "Learn to juggle 3 balls",
  level: "beginner",
  preferences: "step-by-step instruction",
  constraints: "10 minutes daily",
  environment: "indoors",
  equipment: [],
};

async function run() {
  const t = (label: string) => {
    const start = Date.now();
    return () => `${label}: ${((Date.now() - start) / 1000).toFixed(1)}s`;
  };

  console.log("\n=== STAGE 1: parseLearnerProfile ===");
  const t1 = t("parseLearnerProfile");
  const learnerProfile = await parseLearnerProfile(intake);
  console.log(t1());
  console.log(JSON.stringify(learnerProfile, null, 2));

  console.log("\n=== STAGE 2: buildResearchBrief ===");
  const t2 = t("buildResearchBrief");
  const brief = await buildResearchBrief(learnerProfile);
  console.log(t2());
  console.log(JSON.stringify(brief, null, 2));

  console.log("\n=== STAGE 3: conductStructuredWebResearch ===");
  const t3 = t("conductStructuredWebResearch");
  const webResearch = await conductStructuredWebResearch(brief);
  console.log(t3());
  console.log("\n--- stats ---");
  console.log(JSON.stringify(webResearch.stats, null, 2));
  console.log("\n--- sources ---");
  console.log(JSON.stringify(webResearch.sources, null, 2));
  console.log("\n--- findings (summary) ---");
  for (const finding of webResearch.findings) {
    console.log(`\n[${finding.category}]`);
    console.log(`  title: ${finding.title}`);
    console.log(`  summary: ${finding.summary}`);
    console.log(`  properForm (${finding.properForm.length}): ${finding.properForm.slice(0, 2).join(" | ")}`);
    console.log(`  commonMistakes (${finding.commonMistakes.length}): ${finding.commonMistakes.slice(0, 2).join(" | ")}`);
    console.log(`  progressionSteps (${finding.progressionSteps.length})`);
    console.log(`  drills (${finding.drills.length})`);
    console.log(`  evidenceUnits (${finding.evidenceUnits?.length ?? 0})`);
  }

  console.log("\n=== STAGE 4: conductStructuredVideoResearch ===");
  const t4 = t("conductStructuredVideoResearch");
  const videoResearch = await conductStructuredVideoResearch(brief);
  console.log(t4());
  console.log(`  videos captured: ${videoResearch.videos.length}`);
  console.log(JSON.stringify(videoResearch.videos, null, 2));

  console.log("\n=== STAGE 5: synthesizeResearchModel ===");
  const t5 = t("synthesizeResearchModel");
  const researchModel = await synthesizeResearchModel(brief, webResearch.findings, videoResearch.videos);
  console.log(t5());

  console.log("\n=== FINAL DOSSIER STRUCTURE ===");

  const fields: Array<[string, unknown]> = [
    ["metadata", researchModel.metadata],
    ["researchQuality.score", researchModel.researchQuality.score],
    ["researchQuality.gateFailures", researchModel.researchQuality.gateFailures],
    ["researchQuality.repairedSections", researchModel.researchQuality.repairedSections],
    ["researchQuality.notes", researchModel.researchQuality.notes],
    ["evidenceCollection.units.length", researchModel.evidenceCollection?.units?.length ?? 0],
    ["prerequisites.length", researchModel.prerequisites?.length ?? 0],
    ["skillDecomposition.length", researchModel.skillDecomposition?.length ?? 0],
    ["progressionStages.length", researchModel.progressionStages?.length ?? 0],
    ["progressionOrder.length", researchModel.progressionOrder?.length ?? 0],
    ["properFormSignals.length", researchModel.properFormSignals?.length ?? 0],
    ["commonMistakes.length", researchModel.commonMistakes?.length ?? 0],
    ["beginnerDrills.length", researchModel.beginnerDrills?.length ?? 0],
    ["diagnostics.length", researchModel.diagnostics?.length ?? 0],
    ["coachingCues.length", researchModel.coachingCues?.length ?? 0],
    ["tutorialMoments.length", researchModel.tutorialMoments?.length ?? 0],
    ["tutorialLibrary.length", researchModel.tutorialLibrary?.length ?? 0],
    ["safetyConsiderations.length", researchModel.safetyConsiderations?.length ?? 0],
    ["sourceCoverage.length", researchModel.sourceCoverage?.length ?? 0],
    ["webSources.length", researchModel.webSources?.length ?? 0],
    ["openQuestions.length", researchModel.openQuestions?.length ?? 0],
  ];

  for (const [key, val] of fields) {
    console.log(`  ${key}: ${JSON.stringify(val)}`);
  }

  console.log("\n--- properFormSignals (first 3) ---");
  for (const sig of (researchModel.properFormSignals ?? []).slice(0, 3)) {
    console.log(`  aspect: ${sig.aspect}`);
    console.log(`  observableCue: ${sig.observableCue}`);
    console.log(`  sourceRefs: ${sig.sourceRefs?.length ?? 0}`);
  }

  console.log("\n--- commonMistakes (first 3) ---");
  for (const m of (researchModel.commonMistakes ?? []).slice(0, 3)) {
    console.log(`  issue: ${m.issue}`);
    console.log(`  coachingCue: ${m.coachingCue}`);
    console.log(`  likelyCause: ${m.likelyCause}`);
    console.log(`  drill: ${m.drill}`);
  }

  console.log("\n--- progressionStages (names) ---");
  for (const stage of researchModel.progressionStages ?? []) {
    console.log(`  ${stage.name}: ${stage.stageGoal} | blockers: ${stage.commonBlockers?.length ?? 0} | drills: ${stage.recommendedDrills?.length ?? 0}`);
  }

  console.log("\n--- beginnerDrills (names) ---");
  for (const drill of researchModel.beginnerDrills ?? []) {
    console.log(`  ${drill.name}: ${drill.objective}`);
  }

  console.log("\n--- skillDecomposition ---");
  for (const sub of researchModel.skillDecomposition ?? []) {
    console.log(`  ${sub.name}: ${sub.purpose}`);
  }

  console.log("\n--- safetyConsiderations ---");
  console.log(JSON.stringify(researchModel.safetyConsiderations, null, 2));

  console.log("\n--- openQuestions ---");
  console.log(JSON.stringify(researchModel.openQuestions, null, 2));

  console.log("\n--- sourceCoverage (sources populated?) ---");
  for (const cov of (researchModel.sourceCoverage ?? []).slice(0, 3)) {
    console.log(`  claim: ${cov.claim} | sources: ${cov.sources?.length ?? 0}`);
  }

  console.log("\n--- webSources ---");
  console.log(JSON.stringify(researchModel.webSources?.slice(0, 5), null, 2));

  console.log("\n=== FULL DOSSIER JSON ===");
  console.log(JSON.stringify(researchModel, null, 2));
}

run().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
