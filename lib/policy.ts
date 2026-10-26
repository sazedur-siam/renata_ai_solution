import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads the leave policy and parses it into citable clauses.
 *
 * The policy lives in data/policy.md, committed and deployed with the app. The
 * POLICY_MD env var, when set, overrides it without a code change.
 */

export type Clause = {
  /** Citable id, e.g. "4.1(d)", "9.3", "4.0", "7", "Policy details". */
  id: string;
  /** Heading of the section the clause belongs to, e.g. "Annual Leave". */
  heading: string;
  text: string;
};

export type Policy = {
  raw: string;
  clauses: Map<string, Clause>;
  /** Section/subsection id → heading, e.g. "4" → "Types of Leave". */
  headings: Map<string, string>;
};

export class PolicyNotConfiguredError extends Error {
  constructor() {
    super(
      "Policy not configured: set POLICY_MD or add data/policy.md (see README).",
    );
  }
}

let cached: Policy | null = null;

export function loadPolicy(): Policy {
  if (cached) return cached;

  let raw = process.env.POLICY_MD?.trim();
  if (!raw) {
    const file = path.join(process.cwd(), "data", "policy.md");
    if (existsSync(file)) raw = readFileSync(file, "utf8").trim();
  }
  if (!raw) throw new PolicyNotConfiguredError();

  const { clauses, headings } = parsePolicy(raw);
  if (clauses.size === 0) throw new PolicyNotConfiguredError();

  cached = { raw, clauses, headings };
  return cached;
}

const SECTION = /^##\s+(\d+)\.\s+(.+)$/; //        ## 4. Types of Leave
const NAMED_SECTION = /^##\s+(.+)$/; //            ## Policy details
const SUBSECTION = /^###\s+(\d+\.\d+)\s+(.+)$/; // ### 4.1 Annual Leave
const LETTERED = /^\(([a-z])\)\s+(.+)$/; //        (a) Employees earn ...
const NUMBERED = /^(\d+\.\d+)\s+(.+)$/; //         2.1 This policy applies ...

/**
 * Splits the markdown into clauses:
 * - "(a) ..." lines under "### 4.1" become "4.1(a)"
 * - "2.1 ..." lines under "## 2." become "2.1"
 * - any other paragraph or table becomes part of its section's own clause ("1", "4.0", "10")
 */
export function parsePolicy(markdown: string) {
  const clauses = new Map<string, Clause>();
  const headings = new Map<string, string>();
  let sectionId = "";
  let sectionHeading = "";
  let currentId = "";
  let currentHeading = "";

  const append = (id: string, heading: string, text: string) => {
    const existing = clauses.get(id);
    if (existing) existing.text += "\n" + text;
    else clauses.set(id, { id, heading, text });
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("# ") || line.startsWith("End of policy")) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;

    let m: RegExpMatchArray | null;
    if ((m = line.match(SUBSECTION))) {
      currentId = m[1];
      currentHeading = m[2];
      headings.set(currentId, currentHeading);
    } else if ((m = line.match(SECTION))) {
      sectionId = currentId = m[1];
      sectionHeading = currentHeading = m[2];
      headings.set(sectionId, sectionHeading);
    } else if ((m = line.match(NAMED_SECTION))) {
      sectionId = currentId = m[1];
      sectionHeading = currentHeading = m[1];
      headings.set(sectionId, sectionHeading);
    } else if ((m = line.match(LETTERED)) && currentId.includes(".")) {
      append(`${currentId}(${m[1]})`, currentHeading, m[2]);
    } else if ((m = line.match(NUMBERED)) && m[1].startsWith(sectionId + ".")) {
      append(m[1], sectionHeading, m[2]);
    } else if (currentId) {
      append(currentId, currentHeading, tableRowToText(line));
    }
  }
  return { clauses, headings };
}

function tableRowToText(line: string): string {
  if (!line.startsWith("|")) return line;
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim())
    .join(" | ");
}

/** "Section 4.2 (b)" / "§4.2(B)" / "4.2(b)" → "4.2(b)". */
export function normalizeSectionId(id: string): string {
  return id
    .replace(/^\s*(section|sec\.?|§)\s*/i, "")
    .replace(/\s+\(/g, "(")
    .replace(/\(([A-Z])\)/g, (_, l: string) => `(${l.toLowerCase()})`)
    .trim();
}

/**
 * Resolves a cited id to its clause text. Citing a parent ("4.1") resolves to the
 * text of all its clauses, so a correct-but-coarse citation still validates.
 */
export function resolveClause(
  policy: Policy,
  citedId: string,
): Clause | undefined {
  const id = normalizeSectionId(citedId).toLowerCase();
  const matches = [...policy.clauses.values()].filter((c) => {
    const cid = c.id.toLowerCase();
    return cid === id || cid.startsWith(id + "(") || cid.startsWith(id + ".");
  });
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  return {
    id: normalizeSectionId(citedId),
    heading: policy.headings.get(normalizeSectionId(citedId)) ?? matches[0].heading,
    text: matches.map((c) => c.text).join("\n"),
  };
}
