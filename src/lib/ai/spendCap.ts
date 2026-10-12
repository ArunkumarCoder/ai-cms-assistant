import { prisma } from "@/lib/db";
import { DEMO_USER_EMAIL } from "@/lib/demoAccount";

// Day 37's cost/abuse protection: a public, internet-facing demo is one bad
// actor away from running up a real bill on this app's own shared API keys
// — every call so far (SPEC.md §21's rate limiter, §27's validation retry)
// protected *reliability*, nothing protected *spend*. This is the one gate
// standing between a public URL and an unbounded AI bill.
//
// Two independent caps, both read from the same AiCallLog table every other
// cost/usage feature already reads (src/lib/costUsage/, the dashboard) —
// no new table, no new source of truth to keep in sync:
//   - A hard monthly spend cap, global across every user, protecting the
//     API keys themselves (keys are shared per-deployment, not per-user).
//   - A daily per-user call-count cap, so one account (demo or real) can't
//     alone exhaust the monthly budget in an afternoon. The demo account
//     specifically gets a tighter one (task's own explicit ask) — anyone
//     can reach it, a real signed-up account at least had to make one.
export class AiSpendCapError extends Error {
  readonly kind: "monthly" | "daily";

  constructor(kind: "monthly" | "daily", message: string) {
    super(message);
    this.name = "AiSpendCapError";
    this.kind = kind;
  }
}

const DEFAULT_MONTHLY_SPEND_CAP_USD = 20;
const DEFAULT_DAILY_CALL_CAP = 40;
const DEFAULT_DAILY_CALL_CAP_DEMO = 8;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function monthlySpendCapUsd(): number {
  return envNumber("AI_MONTHLY_SPEND_CAP_USD", DEFAULT_MONTHLY_SPEND_CAP_USD);
}

export function dailyCallCap(isDemoUser: boolean): number {
  return isDemoUser
    ? envNumber("AI_DAILY_CALL_CAP_DEMO", DEFAULT_DAILY_CALL_CAP_DEMO)
    : envNumber("AI_DAILY_CALL_CAP", DEFAULT_DAILY_CALL_CAP);
}

export interface SpendCapInput {
  monthSpendUsd: number;
  monthCapUsd: number;
  dailyCallCount: number;
  dailyCallCapValue: number;
}

export interface SpendCapVerdict {
  allowed: boolean;
  kind?: "monthly" | "daily";
}

// Pure decision logic, split out from the DB reads below specifically so
// it's directly unit-testable without a database — every interesting edge
// case (exactly at the cap, one over, one user capped while another isn't)
// is a plain function call, not a mocked Prisma round trip.
export function evaluateSpendCap(input: SpendCapInput): SpendCapVerdict {
  if (input.monthSpendUsd >= input.monthCapUsd) {
    return { allowed: false, kind: "monthly" };
  }
  if (input.dailyCallCount >= input.dailyCallCapValue) {
    return { allowed: false, kind: "daily" };
  }
  return { allowed: true };
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfDayUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function isDemoUser(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email === DEMO_USER_EMAIL;
}

// Called once per logical call, at the very top of client.ts's `runLogged` —
// before the primary provider is resolved, before any fallback attempt. A
// capped call never reaches a provider at all, on the primary attempt or the
// fallback one: "provider fallback must not bypass the caps" (task's own
// wording) is true by construction here, not by remembering to also check
// inside the fallback branch.
export async function assertWithinSpendCap(
  userId: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  const monthAgg = await prisma.aiCallLog.aggregate({
    _sum: { estimatedCostUsd: true },
    where: { createdAt: { gte: startOfMonthUtc(now) } },
  });
  const monthSpendUsd = monthAgg._sum.estimatedCostUsd ?? 0;
  const monthCapUsd = monthlySpendCapUsd();

  const isDemo = await isDemoUser(userId);
  const dailyCallCapValue = dailyCallCap(isDemo);
  const dailyCallCount = userId
    ? await prisma.aiCallLog.count({
        where: { userId, createdAt: { gte: startOfDayUtc(now) } },
      })
    : 0;

  const verdict = evaluateSpendCap({
    monthSpendUsd,
    monthCapUsd,
    dailyCallCount,
    dailyCallCapValue,
  });
  if (!verdict.allowed) {
    const message =
      verdict.kind === "monthly"
        ? "This demo has reached its monthly AI spending limit. Please try again next month, or run your own instance with your own API keys."
        : "You've reached today's AI call limit for this demo. Please try again tomorrow.";
    throw new AiSpendCapError(verdict.kind!, message);
  }
}
