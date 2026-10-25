/**
 * Runs evals/cases.json through the same answerQuestion() the API uses and writes
 * evals/results.md.
 *
 *   npm run eval                       # all cases
 *   npm run eval -- --only nc-jury-duty,pv-named-days
 *   npm run eval -- --category privacy
 *
 * EVAL_DELAY_MS (default 4000) spaces calls out for the Gemini free tier.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { answerQuestion } from "../lib/assistant";
import { configuredModels, GeminiBusyError } from "../lib/gemini";
import { NOT_COVERED, type AssistantReply, type ChatMessage, type Status } from "../lib/schema";

type Case = {
  id: string;
  category: string;
  question?: string;
  history?: ChatMessage[];
  expect: {
    status: Status[];
    cite_any?: string[];
    /** Every entry must appear; an array entry means "any of these". */
    contains?: (string | string[])[];
    not_contains?: string[];
  };
};

type Result = { c: Case; reply?: AssistantReply; failures: string[] };

/** Categories where any failure is unacceptable (Requirements 2 and 3). */
const CRITICAL = new Set(["not_covered", "privacy", "own_data", "injection"]);

const dir = path.dirname(new URL(import.meta.url).pathname);
const delayMs = Number(process.env.EVAL_DELAY_MS ?? 4000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function check(c: Case, reply: AssistantReply): string[] {
  const failures: string[] = [];
  const answer = reply.answer.toLowerCase();
  const { status, cite_any, contains, not_contains } = c.expect;

  if (!status.includes(reply.status)) {
    failures.push(`status ${reply.status}, expected ${status.join("|")}`);
  }
  if (reply.status === "not_covered" && reply.answer !== NOT_COVERED) {
    failures.push("not_covered answer is not the exact required sentence");
  }
  if ((reply.status === "answered" || reply.status === "partial") && reply.citations.length === 0) {
    failures.push("answer has no citation");
  }
  if (cite_any && reply.status !== "not_covered") {
    const ok = reply.citations.some((cit) =>
      cite_any.some((id) => cit.section === id || cit.section.startsWith(id + "(")),
    );
    if (!ok) {
      const got = reply.citations.map((x) => x.section).join(", ") || "none";
      failures.push(`cited ${got}, expected one of ${cite_any.join(", ")}`);
    }
  }
  for (const want of contains ?? []) {
    const options = Array.isArray(want) ? want : [want];
    if (!options.some((o) => answer.includes(o.toLowerCase()))) {
      failures.push(`missing "${options.join('" or "')}"`);
    }
  }
  for (const bad of not_contains ?? []) {
    if (answer.includes(bad.toLowerCase())) failures.push(`contains forbidden "${bad}"`);
  }
  return failures;
}

async function run(c: Case): Promise<AssistantReply> {
  const history = c.history ?? [{ role: "user" as const, content: c.question ?? "" }];
  for (let attempt = 0; ; attempt++) {
    try {
      return await answerQuestion(history);
    } catch (err) {
      if (err instanceof GeminiBusyError && attempt < 3) {
        console.log("   all models busy, waiting 30s…");
        await sleep(30_000);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  let cases: Case[] = JSON.parse(readFileSync(path.join(dir, "cases.json"), "utf8"));
  const only = arg("only")?.split(",");
  const category = arg("category");
  if (only) cases = cases.filter((c) => only.includes(c.id));
  if (category) cases = cases.filter((c) => c.category === category);

  const results: Result[] = [];
  for (const [i, c] of cases.entries()) {
    if (i > 0) await sleep(delayMs);
    let result: Result;
    try {
      const reply = await run(c);
      result = { c, reply, failures: check(c, reply) };
    } catch (err) {
      result = { c, failures: [`error: ${(err as Error).message}`] };
    }
    results.push(result);
    const mark = result.failures.length ? "FAIL" : "pass";
    console.log(`${mark}  ${c.id}${result.failures.length ? "  → " + result.failures.join("; ") : ""}`);
  }

  const byCategory = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const s = byCategory.get(r.c.category) ?? { pass: 0, total: 0 };
    s.total++;
    if (r.failures.length === 0) s.pass++;
    byCategory.set(r.c.category, s);
  }
  const passed = results.filter((r) => r.failures.length === 0).length;
  const criticalFailures = results.filter((r) => CRITICAL.has(r.c.category) && r.failures.length);

  const models = configuredModels().join(" → ");
  const used = new Map<string, number>();
  for (const r of results) {
    if (r.reply?.model) used.set(r.reply.model, (used.get(r.reply.model) ?? 0) + 1);
  }
  const usedText = [...used].map(([m, n]) => `\`${m}\` (${n})`).join(", ") || "none";
  const summary = [...byCategory].map(([cat, s]) => `| ${cat} | ${s.pass}/${s.total} |`).join("\n");
  const rows = results
    .map((r) => {
      const status = r.reply?.status ?? "error";
      const cites = r.reply?.citations.map((x) => x.section).join(", ") ?? "";
      const answer = (r.reply?.answer ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 160);
      const verdict = r.failures.length ? `FAIL: ${r.failures.join("; ")}` : "pass";
      return `| ${r.c.id} | ${status} | ${r.reply?.model ?? ""} | ${cites} | ${answer} | ${verdict} |`;
    })
    .join("\n");

  const md = `# Eval results

- Date: ${new Date().toISOString()}
- Model chain: \`${models}\`
- Answers per model: ${usedText}
- Overall: **${passed}/${results.length}** passed
- Critical categories (not_covered, privacy, own_data, injection): **${criticalFailures.length === 0 ? "all passed" : `${criticalFailures.length} failure(s)`}**

| Category | Passed |
|---|---|
${summary}

| Case | Status | Model | Citations | Answer (truncated) | Verdict |
|---|---|---|---|---|---|
${rows}
`;
  if (!only && !category) writeFileSync(path.join(dir, "results.md"), md);
  console.log(`\n${passed}/${results.length} passed · critical failures: ${criticalFailures.length}`);
  process.exit(criticalFailures.length ? 1 : 0);
}

main();
