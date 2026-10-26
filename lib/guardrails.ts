import { resolveClause, type Clause, type Policy } from "./policy";
import {
  NOT_COVERED,
  type AssistantReply,
  type Citation,
  type ModelOutput,
  type SmallTalkKind,
} from "./schema";

/**
 * Code-side enforcement of the three requirements. The model proposes a status,
 * an answer and citations; this module decides what the employee actually sees.
 *
 * - not_covered     → always the exact required sentence, nothing else
 * - privacy_refusal → fixed courteous template; model text is discarded
 * - own_data        → exact sentence + fixed pointer to PeopleHub / own records
 * - small_talk      → fixed friendly reply for the kind of message; model text is
 *                     discarded, so "small talk" can never carry policy claims
 * - answered/partial→ every citation must exist and quote the policy verbatim;
 *                     with no valid citation left, fail closed to not_covered
 */
export function enforce(policy: Policy, output: ModelOutput): AssistantReply {
  switch (output.status) {
    case "small_talk":
      return smallTalk(output.small_talk_kind);
    case "not_covered":
      return notCovered(
        output.answer.trim() === NOT_COVERED ? undefined : "answer replaced with required wording",
      );
    case "privacy_refusal":
      return privacyRefusal(policy);
    case "own_data":
      return ownData(policy);
    case "answered":
    case "partial":
      return groundedAnswer(policy, output);
  }
}

function notCovered(guardrail?: string): AssistantReply {
  return { status: "not_covered", answer: NOT_COVERED, citations: [], guardrail };
}

export function privacyRefusal(policy: Policy): AssistantReply {
  return {
    status: "privacy_refusal",
    answer:
      "I'm sorry, but I can't share information about another employee. Leave records " +
      "and the reasons for leave, including medical information, are confidential " +
      "(Section 9.1). They may be accessed only by the employee concerned, their line " +
      "manager and authorised HR staff (Section 9.2), and employees must not request " +
      "another employee's leave balance, medical information or reason for leave " +
      "(Section 9.3).\n\nIf you have a work-related need for this information, please " +
      "contact the HR Department at hr@xyz-company.example (Section 11.2). I'm happy to " +
      "help with any question about the leave policy itself.",
    citations: fixedCitations(policy, ["9.1", "9.2", "9.3", "11.2"]),
  };
}

function ownData(policy: Policy): AssistantReply {
  return {
    status: "own_data",
    answer:
      `${NOT_COVERED}\n\nI don't have access to individual leave records. Leave is ` +
      "requested through the PeopleHub employee portal (Section 6.1), and your own leave " +
      "records may be accessed by you, your line manager and authorised HR staff " +
      "(Section 9.2).",
    citations: fixedCitations(policy, ["6.1", "9.2"]),
  };
}

const SMALL_TALK: Record<SmallTalkKind, string> = {
  greeting:
    "Hello! I'm the XYZ Company Leave Policy Assistant. Ask me anything about leave, " +
    "for example how much annual leave you earn, when you need a medical certificate, " +
    "or how to apply. I'll point you to the policy section for every answer.",
  how_are_you:
    "I'm doing well, thank you for asking! How can I help you with the leave policy today?",
  thanks: "You're welcome! If you have any other questions about leave, just ask.",
  goodbye: "Goodbye, and take care! Come back any time you have a question about leave.",
  acknowledgement: "Glad that helps! Is there anything else you'd like to know about leave?",
  about_assistant:
    "I answer questions about the XYZ Company Leave Policy (HR-POL-004, Version 2.0): " +
    "the types of leave and how much you get, how leave is earned, carried forward and " +
    "requested, and the related rules. Every answer cites the policy section it comes " +
    "from.\n\nI can't see anyone's personal leave records, and for anything the policy " +
    "doesn't cover, please contact HR at hr@xyz-company.example.",
  complaint:
    "I'm sorry that wasn't helpful. I can only answer from the leave policy itself, so " +
    "try rephrasing your question and I'll do my best. For anything the policy doesn't " +
    "cover, please contact HR at hr@xyz-company.example.",
};

function smallTalk(kind: SmallTalkKind | undefined): AssistantReply {
  return {
    status: "small_talk",
    answer: SMALL_TALK[kind ?? "greeting"],
    citations: [],
    guardrail: kind ? undefined : "small_talk_kind missing, greeting used",
  };
}

function groundedAnswer(policy: Policy, output: ModelOutput): AssistantReply {
  const citations: Citation[] = [];
  let dropped = 0;

  for (const c of output.citations) {
    const verified = verifyCitation(policy, c.section, c.quote);
    if (!verified) {
      dropped++;
      continue;
    }
    if (!citations.some((x) => x.section === verified.section)) citations.push(verified);
  }

  if (citations.length === 0) {
    return notCovered("no verifiable citation, failed closed");
  }

  let answer = output.answer.trim();
  let status = output.status;
  const notes: string[] = [];
  if (dropped > 0) notes.push(`${dropped} unverifiable citation(s) removed`);

  if (answer.includes(NOT_COVERED)) status = "partial";
  if (status === "partial" && !answer.includes(NOT_COVERED)) {
    answer += `\n\n${NOT_COVERED}`;
    notes.push("required wording appended to partial answer");
  }

  // Requirement 1 asks for a section reference in every answer, so make sure the
  // text itself names one even if the model forgot to cite inline.
  if (!/\bSections?\s+\d/i.test(answer)) {
    const refs = citations.map((c) => `Section ${c.section} (${c.heading})`).join(", ");
    answer += `\n\nPolicy reference: ${refs}.`;
    notes.push("section reference added");
  }

  return {
    status,
    answer,
    citations,
    guardrail: notes.length ? notes.join("; ") : undefined,
  };
}

/**
 * A citation is valid when its quote appears verbatim (after normalising case,
 * whitespace and punctuation) in the policy. If the quote is real but the id is
 * wrong or too coarse, it is re-attributed to the clause that actually contains it.
 */
export function verifyCitation(
  policy: Policy,
  section: string,
  quote: string,
): Citation | null {
  const fragments = quoteFragments(quote);
  if (fragments.length === 0) return null;

  const contains = (clause: Clause) => {
    const text = normalize(clause.text);
    return fragments.every((f) => text.includes(f));
  };

  // Prefer the most specific clause that contains the quote, ideally under the
  // cited id; fall back to the cited section as a whole (quote spans clauses).
  const cited = resolveClause(policy, section);
  const candidates = [...policy.clauses.values()].filter(contains);
  const best =
    candidates.find((c) => cited && isWithin(c.id, cited.id)) ??
    candidates[0] ??
    (cited && contains(cited) ? cited : undefined);

  return best ? { section: best.id, heading: best.heading, quote: quote.trim() } : null;
}

function isWithin(id: string, parent: string): boolean {
  return id === parent || id.startsWith(parent + "(") || id.startsWith(parent + ".");
}

function fixedCitations(policy: Policy, ids: string[]): Citation[] {
  return ids.flatMap((id) => {
    const clause = policy.clauses.get(id);
    return clause ? [{ section: id, heading: clause.heading, quote: clause.text }] : [];
  });
}

/** Splits on ellipses so "A … B" checks both A and B; ignores tiny fragments. */
function quoteFragments(quote: string): string[] {
  return quote
    .split(/\.{3}|…/)
    .map(normalize)
    .filter((f) => f.split(" ").length >= 3 || /\d/.test(f));
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[*|_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:()-]+|[\s"'.,;:()-]+$/g, "")
    .trim();
}
