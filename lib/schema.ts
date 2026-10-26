import { z } from "zod";

/** The exact wording required by the brief for questions the policy does not cover. */
export const NOT_COVERED = "I don't know, please contact HR.";

export const STATUSES = [
  "answered",
  "partial",
  "not_covered",
  "own_data",
  "privacy_refusal",
  "small_talk",
] as const;

export type Status = (typeof STATUSES)[number];

/** Kinds of conversational message that ask for no information. Each gets a fixed reply. */
export const SMALL_TALK_KINDS = [
  "greeting",
  "how_are_you",
  "thanks",
  "goodbye",
  "acknowledgement",
  "about_assistant",
  "complaint",
] as const;

export type SmallTalkKind = (typeof SMALL_TALK_KINDS)[number];

/** What the model must return. Everything here is re-checked in guardrails.ts. */
export const ModelOutput = z.object({
  status: z
    .enum(STATUSES)
    .describe(
      "answered = fully covered by the policy; partial = some parts covered, some not; " +
        "not_covered = the policy does not answer it; own_data = needs the user's own " +
        "personal leave records; privacy_refusal = asks about another person; " +
        "small_talk = a greeting, thanks, goodbye or similar that asks for no information.",
    ),
  small_talk_kind: z
    .enum(SMALL_TALK_KINDS)
    .optional()
    .describe("Only when status is small_talk: which kind of message it is."),
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

/** What the API returns to the browser. */
export type AssistantReply = {
  status: Status;
  answer: string;
  citations: Citation[];
  /** Set when a guardrail changed the model's output, for transparency when debugging. */
  guardrail?: string;
  /** Which Gemini model produced the answer. */
  model?: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Progress while an answer is prepared. The answer itself is only sent once the
 * guardrails have checked it, so the browser never shows unverified text.
 * - reading:  waiting for the model's first output
 * - writing:  the model is producing the answer
 * - fallback: the model was busy, a backup model is being tried
 * - checking: guardrails are verifying the answer and its citations
 */
export type Stage = "reading" | "writing" | "fallback" | "checking";

/** One line of the /api/chat NDJSON stream. */
export type ChatEvent =
  | { type: "stage"; stage: Stage }
  | { type: "reply"; reply: AssistantReply }
  | { type: "error"; error: string; code?: string };
