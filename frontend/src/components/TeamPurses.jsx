export default function TeamPurses({ purses = [] }) {
  return (
    <div className="space-y-2 bg-[#0a0f1c]/90 border border-border rounded-xl p-3">
      <div className="flex items-center justify-between text-slate-100">
        <h4 className="text-sm uppercase tracking-wide">Team Purses</h4>
        <span className="text-[11px] text-slate-300">{purses.length} teams</span>
      </div>
      <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-1">
        {purses.map((p) => (
          <div
            key={p.username}
            className="flex items-center justify-between rounded-lg px-3 py-2 border border-border bg-slate-900/70"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-100">{p.username}</span>
              <span className="text-[11px] text-slate-400">{p.teamName || "No team"}</span>
            </div>
            <span className="text-sm font-semibold text-accent">
              ₹{Number(p.budget ?? 0).toFixed(2)} Cr
            </span>
          </div>
        ))}
        {purses.length === 0 && <p className="text-xs text-slate-400">No teams yet</p>}
      </div>
    </div>
  );
}
