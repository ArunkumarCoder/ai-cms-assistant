import { describe, expect, it } from "vitest";
import {
  availablePageStatusActions,
  resolvePageStatusTransition,
  type PageStatusAction,
} from "./pageStatusTransitions";
import type { PageStatus } from "@/types";

describe("resolvePageStatusTransition", () => {
  it("allows the full forward path: draft -> in-review -> approved -> published", () => {
    expect(resolvePageStatusTransition("submit", "draft")).toBe("in-review");
    expect(resolvePageStatusTransition("approve", "in-review")).toBe("approved");
    expect(resolvePageStatusTransition("publish", "approved")).toBe("published");
  });

  it("allows reject from either in-review or approved, always landing on draft", () => {
    expect(resolvePageStatusTransition("reject", "in-review")).toBe("draft");
    expect(resolvePageStatusTransition("reject", "approved")).toBe("draft");
  });

  it("never allows publishing directly from draft or in-review — only from approved", () => {
    expect(resolvePageStatusTransition("publish", "draft")).toBeNull();
    expect(resolvePageStatusTransition("publish", "in-review")).toBeNull();
  });

  it("rejects every action from published — there is no back-edge out of it", () => {
    for (const action of ["submit", "approve", "reject", "publish"] as PageStatusAction[]) {
      expect(resolvePageStatusTransition(action, "published")).toBeNull();
    }
  });

  it("rejects submit from anything other than draft", () => {
    expect(resolvePageStatusTransition("submit", "in-review")).toBeNull();
    expect(resolvePageStatusTransition("submit", "approved")).toBeNull();
    expect(resolvePageStatusTransition("submit", "published")).toBeNull();
  });

  it("rejects approve from anything other than in-review", () => {
    expect(resolvePageStatusTransition("approve", "draft")).toBeNull();
    expect(resolvePageStatusTransition("approve", "approved")).toBeNull();
  });
});

describe("availablePageStatusActions", () => {
  it("returns exactly the legal actions for each status", () => {
    const cases: [PageStatus, PageStatusAction[]][] = [
      ["draft", ["submit"]],
      ["in-review", ["approve", "reject"]],
      ["approved", ["reject", "publish"]],
      ["published", []],
    ];
    for (const [status, expected] of cases) {
      expect(availablePageStatusActions(status).sort()).toEqual([...expected].sort());
    }
  });
});
