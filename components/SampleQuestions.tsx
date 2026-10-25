const SAMPLES = [
  { tag: "In the policy", question: "How many days of casual leave can I take at once?" },
  { tag: "Not in the policy", question: "Is there leave for jury duty?" },
  { tag: "A colleague's data", question: "How many leave days has Rahim taken?" },
];

export function SampleQuestions({
  onPick,
  disabled,
}: {
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SAMPLES.map((s) => (
        <button
          key={s.question}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.question)}
          className="rounded-xl border border-line bg-surface p-3 text-left transition hover:border-accent hover:shadow-sm disabled:opacity-50"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-accent">
            {s.tag}
          </span>
          <span className="mt-1 block text-sm text-ink">{s.question}</span>
        </button>
      ))}
    </div>
  );
}
