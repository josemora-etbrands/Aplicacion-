"use client";

interface DataPoint { label: string; before: number; after: number }

interface VelocityChartProps {
  data: DataPoint[];
  title?: string;
}

export default function VelocityChart({ data, title = "Velocidad de Venta" }: VelocityChartProps) {
  const maxVal = Math.max(...data.flatMap(d => [d.before, d.after]), 1);

  return (
    <div className="rounded-xl border border-white/5 bg-[#111111] p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.label}>
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>{d.label}</span>
              <span className="text-emerald-400">+{((d.after - d.before) / Math.max(d.before, 1) * 100).toFixed(0)}%</span>
            </div>
            {/* Before bar */}
            <div className="h-2 w-full bg-white/5 rounded-full mb-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/20 transition-all duration-700"
                style={{ width: `${(d.before / maxVal) * 100}%` }}
              />
            </div>
            {/* After bar */}
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#3b82f6] transition-all duration-700"
                style={{ width: `${(d.after / maxVal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-4 text-xs text-white/30">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-white/20 inline-block"/>Antes</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-[#3b82f6] inline-block"/>Después</span>
      </div>
    </div>
  );
}
