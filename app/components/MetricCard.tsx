interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  accent?: "blue" | "red" | "green" | "yellow";
}

const accentMap = {
  blue:   "border-[#3b82f6]/20 bg-[#3b82f6]/5  text-[#3b82f6]",
  red:    "border-red-500/20   bg-red-500/5    text-red-400",
  green:  "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
  yellow: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
};

const trendIcon = { up: "↑", down: "↓", neutral: "→" };
const trendColor = { up: "text-emerald-400", down: "text-red-400", neutral: "text-white/40" };

export default function MetricCard({ label, value, sub, trend, accent = "blue" }: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${accentMap[accent]}`}>
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${accentMap[accent].split(" ")[2]}`}>{value}</p>
      {(sub || trend) && (
        <p className={`text-xs mt-1.5 ${trend ? trendColor[trend] : "text-white/30"}`}>
          {trend && <span className="mr-1">{trendIcon[trend]}</span>}
          {sub}
        </p>
      )}
    </div>
  );
}
