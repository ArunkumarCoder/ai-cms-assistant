import { describe, expect, it } from "vitest";
import { buildGettingStartedChecklist, isGettingStartedComplete } from "./checklist";

describe("buildGettingStartedChecklist", () => {
  it("marks every item undone with no Site and no pages", () => {
    const items = buildGettingStartedChecklist(false, []);
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it("marks connect-site and generate-page done once a Site and a page exist, the rest not", () => {
    const items = buildGettingStartedChecklist(true, [
      { qualityScore: null, faqCount: 0, status: "draft" },
    ]);
    const byId = Object.fromEntries(items.map((item) => [item.id, item.done]));
    expect(byId["connect-site"]).toBe(true);
    expect(byId["generate-page"]).toBe(true);
    expect(byId["seo-score"]).toBe(false);
    expect(byId["faqs"]).toBe(false);
    expect(byId["publish"]).toBe(false);
  });

  it("marks seo-score done once any page has a quality score", () => {
    const items = buildGettingStartedChecklist(true, [
      { qualityScore: null, faqCount: 0, status: "draft" },
      { qualityScore: 72, faqCount: 0, status: "draft" },
    ]);
    expect(items.find((item) => item.id === "seo-score")?.done).toBe(true);
  });

  it("marks faqs done once any page has at least one FAQ", () => {
    const items = buildGettingStartedChecklist(true, [{ qualityScore: null, faqCount: 3, status: "draft" }]);
    expect(items.find((item) => item.id === "faqs")?.done).toBe(true);
  });

  it("marks publish done once any page is published", () => {
    const items = buildGettingStartedChecklist(true, [
      { qualityScore: null, faqCount: 0, status: "published" },
    ]);
    expect(items.find((item) => item.id === "publish")?.done).toBe(true);
  });

  it("never lets one page's partial progress mark unrelated items done", () => {
    const items = buildGettingStartedChecklist(true, [
      { qualityScore: 50, faqCount: 0, status: "draft" },
    ]);
    const byId = Object.fromEntries(items.map((item) => [item.id, item.done]));
    expect(byId["seo-score"]).toBe(true);
    expect(byId["faqs"]).toBe(false);
    expect(byId["publish"]).toBe(false);
  });
});

describe("isGettingStartedComplete", () => {
  it("is false if any item is undone", () => {
    expect(isGettingStartedComplete(buildGettingStartedChecklist(true, []))).toBe(false);
  });

  it("is true once every item is done", () => {
    const items = buildGettingStartedChecklist(true, [
      { qualityScore: 90, faqCount: 2, status: "published" },
    ]);
    expect(isGettingStartedComplete(items)).toBe(true);
  });
});
