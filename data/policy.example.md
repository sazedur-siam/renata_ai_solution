# Example Policy (format reference only)

The real policy lives in `data/policy.md`, which is gitignored because the assessment
policy must not be published. Reviewers receive it in the submission zip. On Vercel it
is provided through the `POLICY_MD` environment variable.

The parser in `lib/policy.ts` expects this structure:

## Policy details

Free text and tables about the document itself.

## 1. Purpose

A section with plain paragraphs is cited as "1".

## 2. Scope

2.1 Numbered clauses under a section are cited as "2.1".

## 4. Types of Leave

### 4.1 Annual Leave

(a) Lettered clauses under a subsection are cited as "4.1(a)".

(b) Tables under a subsection are cited by the subsection id, e.g. "4.0".
