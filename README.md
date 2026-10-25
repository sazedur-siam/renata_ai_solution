# Leave Policy Assistant

A small web app that answers employee questions using **only** the XYZ Company Leave Policy (HR-POL-004 v2.0, a sample document), built for the Renata PLC AI Solutions Specialist (HR) assessment.

- **Live demo:** _<add Vercel URL>_
- **Stack:** Next.js 16 (App Router, TypeScript) · Google Gemini (free tier) via `@google/genai` · Tailwind CSS
- **Full documentation:** see the `documentation/` folder in the submission (architecture, guardrails, evals, deployment, decisions).

## What it does

| Requirement | How it is met |
|---|---|
| 1. Answer correctly and cite the policy | The full policy is in the prompt as numbered clauses. The model must return a verbatim quote for every clause it uses, and code checks each quote against the policy text before showing it. Answers without a verifiable citation are blocked. |
| 2. Admit when the policy doesn't cover it | A `not_covered` answer is always replaced in code with exactly **"I don't know, please contact HR."** |
| 3. Protect other employees' data | Questions about another person get a fixed, courteous refusal citing Sections 9.1–9.3 and pointing to HR. The model's own text is discarded, so nothing can leak. |

## Run it locally

Requirements: Node.js 20+ and a free Gemini API key from <https://aistudio.google.com/apikey>.

```bash
npm install
cp .env.example .env.local        # then set GEMINI_API_KEY in .env.local
# put the policy file at data/policy.md (included in the submission zip)
npm run dev                        # http://localhost:3000
```

### Why `data/policy.md` is not in the repository

The brief says the sample policy must not be shared outside the assessment, so the policy text is **gitignored**. The submission zip includes `data/policy.md`. On Vercel the same text is supplied through the `POLICY_MD` environment variable. Without either, the app refuses to answer and shows "policy not configured"; it never falls back to general knowledge. `data/policy.example.md` shows the expected format.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Your Gemini API key (server-side only, never sent to the browser) |
| `POLICY_MD` | on Vercel | Full contents of `data/policy.md`; optional locally if the file exists |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-latest` |
| `GEMINI_TEMPERATURE` | no | Leave unset to use the model default |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run eval` | Run the 38-case evaluation set against Gemini and write `evals/results.md` |

`npm run eval -- --category privacy` or `npm run eval -- --only nc-jury-duty` runs a subset.

## Project layout

```
app/page.tsx              chat UI
app/api/chat/route.ts     POST /api/chat: validation, rate limit, error handling
lib/policy.ts             loads the policy and parses it into citable clauses
lib/prompt.ts             system prompt (rules + full policy)
lib/gemini.ts             Gemini call with a JSON response schema
lib/guardrails.ts         code-side enforcement of the three requirements
lib/assistant.ts          answerQuestion(): shared by the API and the evals
components/               chat message, citation chip, sample questions, disclaimer
evals/                    test cases, runner, latest results
```

## Privacy

Conversations are not stored or logged on the server; the chat history lives only in the browser tab and the last few turns are sent with each question. The API key stays on the server.
