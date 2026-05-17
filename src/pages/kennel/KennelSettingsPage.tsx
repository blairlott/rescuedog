export default function KennelSettingsPage() {
  return (
    <div className="p-6 max-w-[1400px]">
      <h1 className="text-3xl font-bold uppercase tracking-brand" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
        Settings
      </h1>
      <p className="text-sm text-muted-foreground mt-2">Coming in Phase 1c — guardrails, kill switch, and auto-approve thresholds.</p>
      <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderRadius: 0 }}>
        No settings configured yet.
      </div>
    </div>
  );
}