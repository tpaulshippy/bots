import { describe, expect, it } from "vitest";
import { isFakeModel, clientEventsToAgentEvents } from "../src/agent";
import {
  ALLOWED,
  evaluateText,
  evaluateWebQuery,
  isCrisis,
  policyForBot,
  redactSnippet,
  refusalForVerdict,
  verdictFromModeration,
} from "../src/safety";

const POLICY = { restrict_language: true, restrict_adult_topics: true, enable_web_search: false, global_floor: true };

describe("safety denylists", () => {
  it("blocks floor terms", async () => {
    const v = await evaluateText("how to kill someone", POLICY, "");
    expect(v.blocked).toBe(true);
    expect(v.reason_code).toBe("global_floor");
  });

  it("does not trip on substrings (Essex/sex)", async () => {
    const v = await evaluateText("Essex is a county", POLICY, "");
    expect(v).toEqual(ALLOWED);
  });

  it("blocks adult topics when restricted, allows when relaxed", async () => {
    const blocked = await evaluateText("watch porn", POLICY, "");
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason_code).toBe("adult_topic");
    const relaxed = await evaluateText("watch porn", { ...POLICY, restrict_adult_topics: false }, "");
    expect(relaxed).toEqual(ALLOWED);
  });

  it("blocks profanity when restricted", async () => {
    const v = await evaluateText("this is shit", POLICY, "");
    expect(v.blocked).toBe(true);
    expect(v.reason_code).toBe("language");
    expect(refusalForVerdict(v)).toContain("kinder way");
  });

  it("uses the crisis refusal for self-harm", async () => {
    const v = await evaluateText("i want to kill myself", POLICY, "");
    expect(v.blocked).toBe(true);
    expect(isCrisis(v)).toBe(true);
    expect(refusalForVerdict(v)).toContain("hard");
  });

  it("redacts matched terms, fully redacts remote-only verdicts", () => {
    const v = { blocked: true, reason_code: "language", matched_terms: ["shit"] };
    expect(redactSnippet("oh shit here", v)).toBe("oh [redacted] here");
    expect(redactSnippet("anything", { blocked: true, reason_code: "global_floor", matched_terms: [] })).toBe("[redacted]");
  });

  it("web queries share the input policy", async () => {
    const v = await evaluateWebQuery("buy weed online", POLICY, "");
    expect(v.blocked).toBe(true);
    expect(v.reason_code).toBe("adult_topic");
  });
});

describe("moderation mapping", () => {
  it("floor categories always block", () => {
    const v = verdictFromModeration({ categories: { "sexual/minors": true, sexual: false } }, POLICY);
    expect(v?.reason_code).toBe("global_floor");
  });

  it("policy categories honor relaxed flags", () => {
    const v = verdictFromModeration({ categories: { sexual: true } }, { ...POLICY, restrict_adult_topics: false });
    expect(v).toBeNull();
  });

  it("unknown categories fail closed", () => {
    const v = verdictFromModeration({ categories: { "brand-new-category": true } }, POLICY);
    expect(v?.reason_code).toBe("global_floor");
  });
});

describe("policyForBot", () => {
  it("defaults strict for bot-less chats", () => {
    expect(policyForBot(null)).toEqual({
      restrict_language: true,
      restrict_adult_topics: true,
      enable_web_search: false,
      global_floor: true,
    });
  });
});

describe("agent chips", () => {
  it("maps client events to wire chips", () => {
    expect(
      clientEventsToAgentEvents([
        { tool: "create_flashcard_deck", deck_id: "d", name: "n", card_count: 3 },
        { tool: "web_search", query: "q", result_preview: "5 results" },
      ]),
    ).toEqual([
      { kind: "deck", deck_id: "d", name: "n", card_count: 3 },
      { kind: "sources", label: "🌐 5 results" },
    ]);
  });

  it("fake model gate", () => {
    expect(isFakeModel("e2e-fake-stream-x", true)).toBe(true);
    expect(isFakeModel("e2e-fake-stream-x", false)).toBe(false);
    expect(isFakeModel("other", true)).toBe(false);
  });
});
