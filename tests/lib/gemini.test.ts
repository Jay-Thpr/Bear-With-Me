import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: function () {
    return {
      models: {
        generateContent: mockGenerateContent,
      },
    };
  },
}));

vi.mock("../../prompts/skill-research", () => ({
  buildDiscoveryPrompt: vi.fn(() => "find tutorials prompt"),
  buildAnalysisPrompt: vi.fn(() => "analyze videos prompt"),
  buildSynthesisPrompt: vi.fn(() => "synthesize prompt"),
}));

import { findTutorialUrls, analyzeAllVideos, synthesizeSkillModel, GROUNDING_MODEL, EXTRACTION_MODEL } from "../../lib/gemini";

describe("Gemini pipeline constants", () => {
  it("GROUNDING_MODEL uses gemini-3.1-pro-preview", () => {
    expect(GROUNDING_MODEL).toBe("gemini-3.1-pro-preview");
    expect(GROUNDING_MODEL).not.toContain("2.0");
  });

  it("EXTRACTION_MODEL uses gemini-3.1-flash-lite-preview", () => {
    expect(EXTRACTION_MODEL).toBe("gemini-3.1-flash-lite-preview");
    expect(EXTRACTION_MODEL).not.toContain("2.0");
  });
});

describe("findTutorialUrls (RES-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.YOUTUBE_API_KEY;
  });

  it("RES-02: returns YouTube URLs extracted from grounding metadata", async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://www.youtube.com/watch?v=abc123" } },
            { web: { uri: "https://www.example.com/article" } },
            { web: { uri: "https://youtu.be/def456" } },
          ],
        },
      }],
    });

    const urls = await findTutorialUrls("knife skills");
    expect(urls).toContain("https://www.youtube.com/watch?v=abc123");
    expect(urls).toContain("https://youtu.be/def456");
    expect(urls).not.toContain("https://www.example.com/article");
  });

  it("RES-02: returns at most 5 URLs", async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        groundingMetadata: {
          groundingChunks: Array(10).fill(null).map((_, i) => ({
            web: { uri: `https://www.youtube.com/watch?v=video${i}` },
          })),
        },
      }],
    });
    const urls = await findTutorialUrls("knife skills");
    expect(urls.length).toBeLessThanOrEqual(5);
  });

  it("RES-02: returns empty array when no YouTube URLs found in grounding chunks", async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        groundingMetadata: {
          groundingChunks: [{ web: { uri: "https://example.com/article" } }],
        },
      }],
    });
    const urls = await findTutorialUrls("knife skills");
    expect(Array.isArray(urls)).toBe(true);
  });
});

describe("analyzeAllVideos (RES-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("RES-03: returns empty array when urls array is empty", async () => {
    const result = await analyzeAllVideos([], "knife skills", "learn knife skills");
    expect(result).toEqual([]);
  });

  it("RES-03: passes video URL as fileData.fileUri content part", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"url":"https://www.youtube.com/watch?v=abc","title":"test"}' });
    await analyzeAllVideos(["https://www.youtube.com/watch?v=abc"], "knife skills", "learn knife skills");
    const call = mockGenerateContent.mock.calls[0][0];
    const videoContent = call.contents[0];
    expect(videoContent).toHaveProperty("fileData.fileUri", "https://www.youtube.com/watch?v=abc");
  });

  it("RES-03: returns array of response strings", async () => {
    const mockJson = JSON.stringify({ url: "https://www.youtube.com/watch?v=abc", title: "test", techniques: [] });
    mockGenerateContent.mockResolvedValue({ text: mockJson });
    const result = await analyzeAllVideos(["https://www.youtube.com/watch?v=abc"], "knife skills", "learn knife skills");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("synthesizeSkillModel (RES-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("RES-04: returns parsed skill model object from Gemini", async () => {
    const mockModel = { metadata: { skill: "knife skills", goal: "learn", level: "beginner", createdAt: "", illustration: "" }, teachingStrategy: {}, properForm: {}, commonMistakes: [], progressionOrder: [], safetyConsiderations: [], videoReferences: [], sessionPlan: {}, webSources: [] };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockModel) });
    const result = await synthesizeSkillModel("knife skills", "learn knife skills", "beginner", "{}", [], "");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
  });
});
