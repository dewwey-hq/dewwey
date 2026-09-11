import { describe, it, expect } from "vitest";
import { decideWedding, type DecideWeddingInput, type PostSignal } from "./benWeddingAudit";

function post(overrides: Partial<PostSignal> = {}): PostSignal {
  return { verdict: null, confidence: null, humanLabel: null, ...overrides };
}

function input(overrides: Partial<DecideWeddingInput> = {}): DecideWeddingInput {
  return {
    posts: [],
    venueCreditCount: 0,
    hasCoupleOrParticipant: false,
    hasWeddingWord: false,
    ...overrides,
  };
}

describe("decideWedding", () => {
  describe("retire", () => {
    it("retires when every post is NOT_WEDDING at model confidence >= 0.9", () => {
      const result = decideWedding(
        input({
          posts: [post({ verdict: "NOT_WEDDING", confidence: 0.9 }), post({ verdict: "NOT_WEDDING", confidence: 0.95 })],
        })
      );
      expect(result.decision).toBe("retire");
      expect(result.reason).toMatch(/NOT_WEDDING/);
    });

    it("retires when every post carries a human NOT_WEDDING label (no model verdict at all)", () => {
      const result = decideWedding(
        input({
          posts: [post({ humanLabel: "NOT_WEDDING" }), post({ humanLabel: "NOT_WEDDING" })],
        })
      );
      expect(result.decision).toBe("retire");
    });

    it("retires on a mix of human NOT_WEDDING and model NOT_WEDDING>=0.9 across different posts", () => {
      const result = decideWedding(
        input({
          posts: [post({ humanLabel: "NOT_WEDDING" }), post({ verdict: "NOT_WEDDING", confidence: 0.92 })],
        })
      );
      expect(result.decision).toBe("retire");
    });

    it("does NOT retire on the every-post-NOT_WEDDING path when one post's model confidence is below 0.9", () => {
      const result = decideWedding(
        input({
          posts: [post({ verdict: "NOT_WEDDING", confidence: 0.89 }), post({ verdict: "NOT_WEDDING", confidence: 0.95 })],
        })
      );
      expect(result.decision).not.toBe("retire");
    });

    it("retires a roundup: >=3 venue credits, no couple/participant, no wedding word", () => {
      const result = decideWedding(
        input({
          posts: [post({ verdict: "UNSURE", confidence: 0.5 })],
          venueCreditCount: 3,
          hasCoupleOrParticipant: false,
          hasWeddingWord: false,
        })
      );
      expect(result.decision).toBe("retire");
      expect(result.reason).toMatch(/venue credits/);
    });

    it("retires a roundup even with zero posts read yet (no extraction runs)", () => {
      const result = decideWedding(input({ posts: [], venueCreditCount: 5 }));
      expect(result.decision).toBe("retire");
    });

    it("roundup threshold is >=3: exactly 3 retires, 2 does not", () => {
      expect(decideWedding(input({ posts: [], venueCreditCount: 3 })).decision).toBe("retire");
      expect(decideWedding(input({ posts: [], venueCreditCount: 2 })).decision).toBe("human");
    });
  });

  describe("keep", () => {
    it("keeps when any post has model verdict THIS_VENUE at confidence >= 0.8, even if others are NOT_WEDDING", () => {
      const result = decideWedding(
        input({
          posts: [post({ verdict: "NOT_WEDDING", confidence: 0.95 }), post({ verdict: "THIS_VENUE", confidence: 0.8 })],
        })
      );
      expect(result.decision).toBe("keep");
    });

    it("does not keep on THIS_VENUE below the 0.8 threshold", () => {
      const result = decideWedding(input({ posts: [post({ verdict: "THIS_VENUE", confidence: 0.79 })] }));
      expect(result.decision).not.toBe("keep");
    });

    it("a human WEDDING label always wins over an otherwise-qualifying retire signal", () => {
      // every post would satisfy the NOT_WEDDING retire path except one, and that one is a
      // human WEDDING label -- keep must win.
      const result = decideWedding(
        input({
          posts: [post({ verdict: "NOT_WEDDING", confidence: 0.95 }), post({ humanLabel: "WEDDING" })],
          venueCreditCount: 5, // would also satisfy the roundup retire path on its own
        })
      );
      expect(result.decision).toBe("keep");
      expect(result.reason).toMatch(/human WEDDING/);
    });

    it("a human WEDDING label wins even over a roundup (>=3 venue credits, no couple/word)", () => {
      const result = decideWedding(
        input({
          posts: [post({ humanLabel: "WEDDING" })],
          venueCreditCount: 4,
          hasCoupleOrParticipant: false,
          hasWeddingWord: false,
        })
      );
      expect(result.decision).toBe("keep");
    });
  });

  describe("human", () => {
    it("falls to human review with no strong signal either way", () => {
      const result = decideWedding(
        input({
          posts: [post({ verdict: "OTHER_VENUE", confidence: 0.6 }), post({ verdict: "UNSURE", confidence: 0.4 })],
          venueCreditCount: 1,
        })
      );
      expect(result.decision).toBe("human");
    });

    it("does not retire a roundup-shaped wedding when a wedding word is present", () => {
      const result = decideWedding(input({ posts: [], venueCreditCount: 4, hasWeddingWord: true }));
      expect(result.decision).toBe("human");
    });

    it("does not retire a roundup-shaped wedding when a couple/participant signal is present", () => {
      const result = decideWedding(input({ posts: [], venueCreditCount: 4, hasCoupleOrParticipant: true }));
      expect(result.decision).toBe("human");
    });

    it("defaults to human with zero posts and below-threshold venue credits", () => {
      const result = decideWedding(input({ posts: [], venueCreditCount: 1 }));
      expect(result.decision).toBe("human");
    });
  });
});
