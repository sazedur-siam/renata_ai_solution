import type { QuotaSnapshot } from "@/lib/quota";

/** Header pill showing the estimated free-tier AI answers left today. */
export function QuotaBadge({ quota }: { quota: QuotaSnapshot | null }) {
  if (!quota) return null;

  const resets = `resets in ~${quota.resetsInHours}h`;
  const usedUp = quota.remaining === 0;
  const onBackup = !usedUp && quota.primaryRemaining === 0;

  const details =
    `Estimate of the shared free Gemini quota for this demo (about ${quota.models[0]?.limit ?? 20} ` +
    `answers per model per day, ${resets}). ` +
    (onBackup
      ? "The main models are used up, so a lighter backup model is answering."
      : `${quota.primaryRemaining} left on the main models, then a lighter backup model answers.`);

  return (
    <span
      title={details}
      aria-label={details}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-semibold ${
        usedUp
          ? "border-highlight bg-highlight/20 text-[#f8f9fa]"
          : "border-[#f8f9fa]/30 text-[#f8f9fa]/90"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${usedUp ? "bg-highlight" : onBackup ? "bg-amber-300" : "bg-emerald-300"}`}
      />
      {usedUp
        ? `Free AI quota used up · ${resets}`
        : `≈ ${quota.remaining} AI answers left today${onBackup ? " (backup model)" : ""}`}
    </span>
  );
}
