import { z } from "zod";

/** The exact wording required by the brief for questions the policy does not cover. */
export const NOT_COVERED = "I don't know, please contact HR.";

export const STATUSES = [
  "answered",
  "partial",
  "not_covered",
  "own_data",
  "privacy_refusal",
] as const;

export type Status = (typeof STATUSES)[number];

/** What the model must return. Everything here is re-checked in guardrails.ts. */
export const ModelOutput = z.object({
  status: z
    .enum(STATUSES)
    .describe(
      "answered = fully covered by the policy; partial = some parts covered, some not; " +
        "not_covered = the policy does not answer it; own_data = needs the user's own " +
        "personal leave records; privacy_refusal = asks about another person.",
    ),
  answer: z
    .string()
    .describe("The reply to the employee, in English, citing sections inline."),
  citations: z
    .array(
      z.object({
        section: z
          .string()
          .describe('Clause id exactly as shown in the policy, e.g. "4.1(d)" or "9.3".'),
        quote: z
          .string()
          .describe("A short verbatim quote from that clause that supports the answer."),
      }),
    )
    .describe("Every policy clause the answer relies on. Empty only when nothing is cited."),
});

export type ModelOutput = z.infer<typeof ModelOutput>;

export const responseJsonSchema = z.toJSONSchema(ModelOutput);

export type Citation = { section: string; heading: string; quote: string };

/** What the API returns to the browser (and what evals assert on). */
export type AssistantReply = {
  status: Status;
  answer: string;
  citations: Citation[];
  /** Set when a guardrail changed the model's output, for transparency in evals. */
  guardrail?: string;
  /** Which Gemini model produced the answer. */
  model?: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
