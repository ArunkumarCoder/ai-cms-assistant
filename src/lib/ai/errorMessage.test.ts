import { describe, expect, it } from "vitest";
import { AiProviderError } from "./types";
import { describeAiActionFailure } from "./errorMessage";

describe("describeAiActionFailure", () => {
  it("returns a friendly 'try again' message for a retryable provider error", () => {
    const err = new AiProviderError("groq", "429 rate limited", { retryable: true });
    expect(describeAiActionFailure(err, "fallback")).toMatch(/try again in a moment/i);
  });

  it("passes through the real message for a non-retryable provider error", () => {
    const err = new AiProviderError("openai", "Invalid API key", { retryable: false });
    expect(describeAiActionFailure(err, "fallback")).toBe("Invalid API key");
  });

  it("passes through a plain Error's message unchanged", () => {
    expect(describeAiActionFailure(new Error("schema validation failed"), "fallback")).toBe(
      "schema validation failed",
    );
  });

  it("uses the fallback for a non-Error thrown value", () => {
    expect(describeAiActionFailure("not an error", "fallback")).toBe("fallback");
  });
});
