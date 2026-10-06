import * as z from "zod";
import type { AiCallType, AiProviderName } from "./types";

// Thrown when a provider's structured response parses as JSON but doesn't
// match the Zod schema that call type promises — a different failure mode
// from AiProviderError (auth, network, no content at all): the provider
// worked, the *shape* of what it said didn't. Kept as its own error type so
// ./errorMessage.ts and ./client.ts's retry loop can each react to it
// specifically, instead of lumping it in with transport failures.
export class AiValidationError extends Error {
  readonly callType: AiCallType;
  readonly provider: AiProviderName;
  readonly issues: z.core.$ZodIssue[];

  constructor(callType: AiCallType, provider: AiProviderName, issues: z.core.$ZodIssue[]) {
    super(`"${callType}" response from ${provider} failed schema validation: ${summarize(issues)}`);
    this.name = "AiValidationError";
    this.callType = callType;
    this.provider = provider;
    this.issues = issues;
  }
}

function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.length > 0 ? issue.path.join(".") : "(root)";
}

function summarize(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issuePath(issue)}: ${issue.message}`).join("; ");
}

// Fed back into the prompt on a validation retry (SPEC.md's "a bounded
// retry... with the validation error fed back into the prompt") so the model
// sees exactly what was wrong with its last answer instead of blindly
// repeating the same mistake against an unchanged prompt. Always built from
// the *original* prompt, not the previous retry's — so re-prompting doesn't
// compound into an ever-longer message across attempts.
export function appendValidationFeedback(originalPrompt: string, issues: z.core.$ZodIssue[]): string {
  const problems = issues.map((issue) => `- ${issuePath(issue)}: ${issue.message}`).join("\n");
  return (
    `${originalPrompt}\n\n` +
    "Your previous response did not match the required JSON shape. Problems found:\n" +
    `${problems}\n\n` +
    "Return a corrected JSON response that fixes every problem above and still follows the schema."
  );
}
