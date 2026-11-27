import { useId, useState } from "react";

export interface TrendPoint {
  /** Month label, e.g. "Jun". */
  label: string;
  /** Full name used in the tooltip and table, e.g. "June 2026". */
  title: string;
  value: number;
}

const W = 320, H = 150, PAD = { top: 18, right: 8, bottom: 22, left: 40 };
const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;

/** Round the axis top up to a clean number (1, 2, 2.5 or 5 × 10ⁿ) and split it into 4 steps. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw;
  return Array.from({ length: 5 }, (_, i) => i * step);
}

const compact = (n: number) => n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n * 100) / 100);

/**
 * One measure per month in the brand orange: columns for per-month amounts, a line for
 * running totals. Hover or focus a month for its value; a table view sits below.
 */
export function TrendChart({ title, note, points, kind = "column", format = compact }: {
  title: string; note?: string; points: TrendPoint[];
  kind?: "column" | "line";
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const ticks = niceTicks(Math.max(...points.map(p => p.value), 0));
  const top = ticks[ticks.length - 1];
  const band = plotW / points.length;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const bar = Math.min(24, band * 0.6);
  const last = points.length - 1;
  const linePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const shown = hover ?? last;

  return <figure className="trend" aria-labelledby={`${id}-t`}>
    <figcaption>
      <span id={`${id}-t`} className="trend-title">{title}</span>
      <span className="trend-value"><strong>{format(points[shown]?.value ?? 0)}</strong> {points[shown]?.title}</span>
      {note && <span className="trend-note">{note}</span>}
    </figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, by month`} onMouseLeave={() => setHover(null)}>
      {ticks.map(t => <g key={t}>
        <line className="trend-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
        <text className="trend-axis" x={PAD.left - 6} y={y(t) + 3} textAnchor="end">{compact(t)}</text>
      </g>)}
      {kind === "line" ? <>
        <path className="trend-area" d={`${linePath} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} />
        <path className="trend-line" d={linePath} />
        {hover !== null && <line className="trend-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />}
        <circle className="trend-dot" cx={x(shown)} cy={y(points[shown]?.value ?? 0)} r={4.5} />
      </> : points.map((p, i) => {
        const h = Math.max(0, y(0) - y(p.value)), r = Math.min(4, h, bar / 2);
        const left = x(i) - bar / 2, topY = y(p.value);
        // 4px rounded top, square at the baseline
        return h > 0 && <path key={p.title} className={`trend-bar${hover === i ? " is-hover" : ""}`}
          d={`M${left},${y(0)} V${topY + r} Q${left},${topY} ${left + r},${topY} H${left + bar - r} Q${left + bar},${topY} ${left + bar},${topY + r} V${y(0)} Z`} />;
      })}
      {points.map((p, i) => <text key={p.title} className="trend-axis" x={x(i)} y={H - 6} textAnchor="middle">{p.label}</text>)}
      {points.map((p, i) => <rect key={p.title} className="trend-hit" x={PAD.left + band * i} y={PAD.top} width={band} height={plotH}
        tabIndex={0} aria-label={`${p.title}: ${format(p.value)}`}
        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />)}
    </svg>
    <details className="trend-table">
      <summary>Table</summary>
      <table><thead><tr><th>Month</th><th>{title}</th></tr></thead>
        <tbody>{points.map(p => <tr key={p.title}><td>{p.title}</td><td>{format(p.value)}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}
