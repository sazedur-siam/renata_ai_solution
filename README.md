# Leave Policy Assistant

A small web app that answers employee questions using **only** the XYZ Company Leave Policy (HR-POL-004 v2.0, a sample document), built for the Renata PLC AI Solutions Specialist (HR) assessment.

- **Live demo:** _<add Vercel URL>_
- **Stack:** [Next.js 16](https://nextjs.org/docs) (App Router, TypeScript) · [Google Gemini API](https://ai.google.dev/gemini-api/docs) (free tier) via [`@google/genai`](https://www.npmjs.com/package/@google/genai) · [Tailwind CSS 4](https://tailwindcss.com/docs)
- **Full documentation:** see the `documentation/` folder in the submission (architecture, guardrails, evals, deployment, decisions).

## What it does

| Requirement | How it is met |
|---|---|
| 1. Answer correctly and cite the policy | The full policy is in the prompt as numbered clauses. The model must return a verbatim quote for every clause it uses, and code checks each quote against the policy text before showing it. Answers without a verifiable citation are blocked. |
| 2. Admit when the policy doesn't cover it | A `not_covered` answer is always replaced in code with exactly **"I don't know, please contact HR."** |
| 3. Protect other employees' data | Questions about another person get a fixed, courteous refusal citing Sections 9.1–9.3 and pointing to HR. The model's own text is discarded, so nothing can leak. |

The header also shows an **estimate of free AI answers left today** (Gemini's free tier allows about 20 requests per model per day; see [Gemini quota](#gemini-quota)), and a **"Use your API key"** button so anyone can use their own free Gemini key (see [Use your own API key](#use-your-own-api-key)).

---

## Run it locally: step by step

### 1. Install Node.js (version 20.9 or newer)

Next.js 16 needs Node.js **20.9+**. The current LTS release (22 or 24) is recommended. npm comes with Node.js.

- **Any OS:** download the LTS installer from <https://nodejs.org/en/download>.
- **macOS / Linux (optional, version manager):** [nvm](https://github.com/nvm-sh/nvm)
  ```bash
  nvm install --lts
  nvm use --lts
  ```
- **Windows (optional, version manager):** [nvm-windows](https://github.com/coreybutler/nvm-windows)

Check the installation:

```bash
node -v    # v20.9.0 or newer
npm -v     # 10 or newer
```

### 2. Get the code

**Option A, from the submission zip** (includes the policy file): unzip it and open a terminal in the `project` folder.

**Option B, from GitHub** (needs [Git](https://git-scm.com/downloads) and access to the repository):

```bash
git clone https://github.com/sazedur-siam/renata_ai_solution.git
cd renata_ai_solution
```

### 3. Install dependencies

```bash
npm install
```

This installs everything listed in `package.json` ([npm install docs](https://docs.npmjs.com/cli/commands/npm-install)).

### 4. Get a free Gemini API key

1. Go to **Google AI Studio → API keys**: <https://aistudio.google.com/apikey>
2. Sign in with a Google account and click **Create API key**.
3. Copy the key (it starts with `AIza…`). Keep it private and never commit it.

Free-tier limits are listed at <https://ai.google.dev/gemini-api/docs/rate-limits>.

### 5. Create your environment file

Copy the example file and add your key:

```bash
cp .env.example .env.local        # Windows (PowerShell): Copy-Item .env.example .env.local
```

Open `.env.local` and set:

```
GEMINI_API_KEY=your-key-here
```

Prefer not to put a key on the server? Skip this step and add your key in the app instead (**Use your API key** in the header; see [Use your own API key](#use-your-own-api-key)).

`.env.local` (and `.env`) are gitignored. See [Environment variables](#environment-variables) for the optional settings and [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables) for how they are loaded.

### 6. Add the policy file

The app needs the policy at **`data/policy.md`**.

- **Submission zip:** it's already there.
- **GitHub clone:** the file is deliberately not in the repository (see [why](#why-datapolicymd-is-not-in-the-repository)). Copy `data/policy.md` from the submission zip into the `data/` folder.

Without it, the app answers "The leave policy is not configured" instead of guessing.

### 7. Start the app

```bash
npm run dev
```

Open <http://localhost:3000> and try the three sample questions:

| Click | Expected result |
|---|---|
| "How many days of casual leave can I take at once?" | Answer citing **§4.2(b)**; click the chip to see the policy wording |
| "Is there leave for jury duty?" | Exactly **"I don't know, please contact HR."** |
| "How many leave days has Rahim taken?" | A polite privacy refusal citing Sections 9.1–9.3 |

Answers usually take 3–15 seconds on the free tier.

### 8. Optional: production build

```bash
npm run build
npm start          # serves the production build on http://localhost:3000
```

### 9. Optional: run the evaluation suite

```bash
npm run eval                              # all 38 cases → writes evals/results.md
npm run eval -- --category privacy        # one category
npm run eval -- --only nc-jury-duty       # specific cases
```

⚠️ A full run makes 38 Gemini calls, so on the free tier it uses up most of a day's quota. Run a subset, or use a separate key, if you also want to demo the app the same day.

### 10. Optional: deploy to Vercel

1. Push the repository to GitHub and import it at <https://vercel.com/new> (guide: <https://vercel.com/docs/frameworks/full-stack/nextjs>)
2. Add environment variables (<https://vercel.com/docs/environment-variables>):
   - `GEMINI_API_KEY`: your key
   - `POLICY_MD`: the **full contents** of `data/policy.md` (paste the whole file)
3. Deploy, then test the three sample questions on the live URL.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | recommended | The shared Gemini key (server-side only, never sent to the browser). If unset, visitors must add their own key in the UI |
| `POLICY_MD` | on Vercel | Full contents of `data/policy.md`; optional locally if the file exists |
| `GEMINI_MODELS` (or `GEMINI_MODEL`) | no | Comma-separated models tried in order when one is overloaded or out of quota. Default: `gemini-3.5-flash,gemini-3-flash-preview,gemini-flash-latest,gemini-flash-lite-latest` |
| `GEMINI_DAILY_LIMIT` | no | Assumed free requests per model per day for the quota estimate (default `20`) |
| `GEMINI_TEMPERATURE` | no | Leave unset to use the model default |

## Gemini quota

The Gemini API doesn't report how much quota is left, so the app estimates it:

- It counts successful answers per model per day. Free-tier quotas reset at midnight Pacific time.
- When Google returns a daily-quota error, the app learns that model's real limit and reset time, marks it as used up and skips it until the reset.
- The header badge shows the estimate (e.g. "≈ 59 AI answers left today"). Hover over it for details. When every model is used up, users see "Today's free AI quota for this demo is used up. It resets in about N hours."

The count is held in server memory, so it restarts with the server (and with each serverless instance on Vercel) and corrects itself at the next quota error. To remove the daily caps, enable billing on the key's project: <https://ai.google.dev/gemini-api/docs/billing>.

## Use your own API key

Anyone can use the site with their own free Gemini key, with no server setup:

1. Click **Use your API key** in the header. (The dialog also opens automatically when the shared quota runs out, or when the site has no key of its own.)
2. Paste a key from <https://aistudio.google.com/apikey> and click **Save & verify**. The key is checked with Google by listing models, which uses no answer quota.
3. The header shows **✓ Your API key**, and the quota badge switches to your key's own estimate.

How the key is handled:

- **Stored only in your browser**, in [localStorage](https://developer.mozilla.org/docs/Web/API/Window/localStorage) when "Remember on this device" is ticked, otherwise in [sessionStorage](https://developer.mozilla.org/docs/Web/API/Window/sessionStorage), which is cleared when the tab closes. There is no database.
- **Sent only to this site's own server**, in the `x-gemini-api-key` header with each question (over HTTPS when deployed). The server uses it for that request only and never logs or stores it. Quota counts are kept under a one-way hash of the key, never the key itself.
- **Removable at any time** with **Remove key** in the dialog. On shared computers, remove it when you're done: anything stored in a browser profile can be read by someone using that profile.

The site can even be deployed **without** `GEMINI_API_KEY`. Visitors are then asked for their own key before their first question.

## Why `data/policy.md` is not in the repository

The brief says the sample policy must not be shared outside the assessment, so the policy text is **gitignored**. The submission zip includes `data/policy.md`, and on Vercel the same text comes from the `POLICY_MD` environment variable. Without either, the app refuses to answer; it never falls back to general knowledge. `data/policy.example.md` shows the expected format.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` or "Node.js version … is not supported" | Install Node.js 20.9+ (step 1), then open a new terminal |
| "The assistant is not configured (missing API key)" | `GEMINI_API_KEY` is missing from `.env.local`/`.env`. Save the file and restart `npm run dev` |
| "The leave policy is not configured" | Put `data/policy.md` in place (step 6), or set `POLICY_MD` on Vercel |
| "The AI service is busy right now" | Google's free models are overloaded. Wait a minute and retry |
| "Today's free AI quota … is used up" | Click **Use your API key** and add your own free key, wait for the daily reset, or enable billing |
| "Google rejected your Gemini API key" | Copy the key again from AI Studio, or remove it to go back to the shared key |
| Your saved key disappeared | It was saved for this tab only ("Remember on this device" unticked), or the browser cleared site data |
| Port 3000 already in use | Stop the other server, or run `npm run dev -- -p 3001` |
| Styles look outdated after pulling changes | Stop the dev server, delete the `.next` folder, run `npm run dev` again |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on <http://localhost:3000> |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run eval` | Run the evaluation set against Gemini and write `evals/results.md` |

## Project layout

```
app/page.tsx              chat UI
app/api/chat/route.ts     POST /api/chat: validation, rate limit, error handling
app/api/quota/route.ts    GET /api/quota: estimated free answers left today
app/api/key/verify/       POST: checks a visitor's own key with Google (no quota used)
lib/keyStore.ts           browser-side storage of the visitor's key (local/session storage)
lib/userKey.ts            reads and validates the x-gemini-api-key header
lib/policy.ts             loads the policy and parses it into citable clauses
lib/prompt.ts             system prompt (rules + full policy)
lib/gemini.ts             Gemini calls with a JSON response schema and model fallback
lib/quota.ts              free-tier quota estimate
lib/guardrails.ts         code-side enforcement of the three requirements
lib/assistant.ts          answerQuestion(): shared by the API and the evals
components/               chat message, citation chip, sample questions, quota badge, API key dialog, disclaimer
evals/                    test cases, runner, latest results
```

## Privacy

Conversations are not stored or logged on the server. The chat history lives only in the browser tab, and the last few turns are sent with each question. The shared API key stays on the server. A visitor's own key stays in their browser and is used by the server only for the request it arrives with.
