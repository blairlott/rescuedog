interface Props {
  lastSync: string | null;
}

export function FreshnessIndicator({ lastSync }: Props) {
  if (!lastSync) {
    return <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-muted text-muted-foreground" style={{ borderRadius: 0 }}>
      <span className="h-2 w-2 bg-muted-foreground" /> No data
    </span>;
  }
  const ageHours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
  let cls = "bg-green-100 text-green-900";
  let dot = "bg-green-600";
  let label = "Fresh";
  if (ageHours > 26) {
    cls = "bg-red-100 text-red-900";
    dot = "bg-red-600";
    label = "Stale";
  } else if (ageHours > 12) {
    cls = "bg-amber-100 text-amber-900";
    dot = "bg-amber-600";
    label = "Aging";
  }
  const ageText = ageHours < 1 ? `${Math.round(ageHours * 60)}m ago` : `${Math.round(ageHours)}h ago`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 ${cls}`} style={{ borderRadius: 0 }}>
      <span className={`h-2 w-2 ${dot}`} />
      {label} · {ageText}
    </span>
  );
}