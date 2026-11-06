import { useRef, useState } from 'react';
import { monthLabel } from '../lib/dates';
import { fmt0 } from '../lib/money';
import type { MonthSummary } from '../lib/analysis';

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: Array<{ label: string; value: string; swatch?: string; line?: boolean }>;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">
      <div className="tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="tip-row" key={r.label}>
          {r.swatch && <span className={r.line ? 'sw line' : 'sw'} style={{ background: r.swatch }} />}
          <span>{r.label}</span>
          <span className="num">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: 'needs', label: 'Needs', color: 'var(--series-1)' },
  { key: 'wants', label: 'Wants', color: 'var(--series-2)' },
  { key: 'other', label: 'Other', color: 'var(--series-3)' },
] as const;

/** Stacked monthly spending (needs / wants / other) with income as a tick mark over each month. */
export function MonthlyChart({ data }: { data: MonthSummary[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 260;
  const m = { l: 48, r: 8, t: 12, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const showIncome = data.some((d) => d.income > 0);
  const max = niceMax(Math.max(...data.map((d) => Math.max(Math.max(0, d.needs) + Math.max(0, d.wants) + Math.max(0, d.other), showIncome ? d.income : 0)), 0));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const band = iw / Math.max(data.length, 1);
  const bw = Math.min(36, band * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(data.length / 12);

  const show = (i: number, evt: React.MouseEvent | React.FocusEvent) => {
    const d = data[i];
    const rect = wrap.current!.getBoundingClientRect();
    const target = (evt.currentTarget as Element).getBoundingClientRect();
    setHover(i);
    setTip({
      x: Math.min(target.left - rect.left + target.width / 2, rect.width - 170),
      y: 8,
      title: monthLabel(d.month),
      rows: [
        ...(showIncome ? [{ label: 'Income', value: fmt0(d.income), swatch: 'var(--text-primary)', line: true }] : []),
        ...SERIES.map((s) => ({ label: s.label, value: fmt0(d[s.key]), swatch: s.color })),
        { label: 'Total spent', value: fmt0(d.spending) },
        ...(showIncome ? [{ label: 'Left over', value: fmt0(d.income - d.spending - d.savings) }] : []),
      ],
    });
  };

  return (
    <div className="chart" ref={wrap} onMouseLeave={() => { setTip(null); setHover(null); }}>
      <div className="legend" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key}>
            <i className="sw" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        {showIncome && (
          <span>
            <i className="sw line" style={{ background: 'var(--text-primary)' }} /> Income
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly spending by type compared with income">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'gridline'} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end" className="tick">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          let acc = 0;
          const segs = SERIES.map((s) => {
            const v = Math.max(0, d[s.key]);
            const y0 = y(acc);
            acc += v;
            const y1 = y(acc);
            return { s, y0, y1, v };
          }).filter((g) => g.v > 0);
          return (
            <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45}>
              {segs.map((g, j) => {
                const top = j === segs.length - 1;
                const h = Math.max(0, g.y0 - g.y1 - (j > 0 ? 2 : 0));
                return top ? (
                  <path key={g.s.key} d={roundedTop(cx - bw / 2, g.y1, bw, h, 4)} fill={g.s.color} />
                ) : (
                  <rect key={g.s.key} x={cx - bw / 2} y={g.y1} width={bw} height={h} fill={g.s.color} />
                );
              })}
              {showIncome && d.income > 0 && (
                <line x1={cx - bw / 2 - 5} x2={cx + bw / 2 + 5} y1={y(d.income)} y2={y(d.income)} className="income-mark" />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="tick">
                  {monthLabel(d.month)}
                </text>
              )}
              <rect
                x={m.l + band * i}
                y={m.t}
                width={band}
                height={ih}
                fill="transparent"
                tabIndex={0}
                aria-label={`${monthLabel(d.month)}: spent ${fmt0(d.spending)}${showIncome ? `, income ${fmt0(d.income)}` : ''}`}
                onMouseEnter={(e) => show(i, e)}
                onFocus={(e) => show(i, e)}
                onBlur={() => { setTip(null); setHover(null); }}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Horizontal bars, sorted, direct-labelled – used for category and merchant breakdowns. */
export function BarList({
  rows,
  onSelect,
}: {
  rows: Array<{ label: string; value: number; sub?: string; budget?: number }>;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.budget ?? 0)), 1);
  return (
    <ul className="barlist">
      {rows.map((r) => {
        const over = r.budget !== undefined && r.value > r.budget;
        return (
          <li key={r.label}>
            <button className="barrow" onClick={() => onSelect?.(r.label)} disabled={!onSelect} title={r.sub}>
              <span className="bl-label">{r.label}</span>
              <span className="bl-track">
                <span className={over ? 'bl-bar over' : 'bl-bar'} style={{ width: `${(r.value / max) * 100}%` }} />
                {r.budget !== undefined && r.budget > 0 && <span className="bl-budget" style={{ left: `${(r.budget / max) * 100}%` }} title={`Budget ${fmt0(r.budget)}`} />}
              </span>
              <span className="bl-value num">{fmt0(r.value)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
