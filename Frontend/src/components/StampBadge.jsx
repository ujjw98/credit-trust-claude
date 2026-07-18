const TIER_LABEL = { excellent: "Excellent", strained: "Strained", risk: "Risk" };
const TIER_CLASS = { excellent: "stamp-low", strained: "stamp-medium", risk: "stamp-high" };

export default function StampBadge({ rcs, size = "md" }) {
  const sizeClasses = size === "lg" ? "h-28 w-28 text-[10px]" : "h-20 w-20 text-[8px]";

  if (!rcs) {
    return (
      <div
        className={`stamp ${sizeClasses} border-ink-soft/40 text-ink-soft/60`}
        title="No credit history recorded yet"
      >
        <span className="font-sans normal-case tracking-normal">No record</span>
      </div>
    );
  }

  return (
    <div className={`stamp ${TIER_CLASS[rcs.tier]} ${sizeClasses}`} title={`RCS ${rcs.rcs_score} / 900`}>
      <span className={size === "lg" ? "text-xl font-semibold leading-none" : "text-base font-semibold leading-none"}>
        {rcs.rcs_score}
      </span>
      <span className="mt-1">{TIER_LABEL[rcs.tier]}</span>
    </div>
  );
}
