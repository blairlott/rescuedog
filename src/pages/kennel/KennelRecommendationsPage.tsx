export default function KennelRecommendationsPage() {
  return (
    <div className="p-6 max-w-[1400px]">
      <h1 className="text-3xl font-bold uppercase tracking-brand" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
        Recommendations
      </h1>
      <p className="text-sm text-muted-foreground mt-2">Coming in Phase 1b — Lindy's pending suggestions will appear here for approval.</p>
      <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderRadius: 0 }}>
        No recommendations yet.
      </div>
    </div>
  );
}