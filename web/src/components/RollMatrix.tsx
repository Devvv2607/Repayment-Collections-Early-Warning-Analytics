"use client";

import { useState } from "react";

import { num, pct } from "@/lib/format";
import type { Bucket, RollCell } from "@/lib/types";

const ORDER: Bucket[] = ["0", "1-30", "31-60", "61-90", "90+"];

// Sequential single-hue ramp (light -> dark blue) for magnitude.
const RAMP = ["#f7fafe", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
function shade(p: number): string {
  // sqrt stretches the many small values so they stay distinguishable
  const idx = Math.min(RAMP.length - 1, Math.floor(Math.sqrt(p) * RAMP.length));
  return RAMP[idx];
}

export default function RollMatrix({ cells }: { cells: RollCell[] }) {
  const [hover, setHover] = useState<RollCell | null>(null);
  const get = (f: Bucket, t: Bucket) => cells.find((c) => c.from_bucket === f && c.to_bucket === t)!;
  const rollCell = (f: Bucket, t: Bucket) => f === "1-30" && (t === "31-60" || t === "61-90" || t === "90+");

  return (
    <div>
      <div className="grid grid-cols-[3.25rem_repeat(5,minmax(0,1fr))] gap-1 text-xs sm:grid-cols-[5rem_repeat(5,minmax(0,1fr))] sm:text-sm">
        <div className="flex items-end justify-center pb-1 text-[10px] leading-tight text-ink-muted sm:text-xs">
          now ↓ / next →
        </div>
        {ORDER.map((t) => (
          <div key={t} className="pb-1 text-center font-medium text-ink-2">
            {t}
          </div>
        ))}
        {ORDER.map((f) => (
          <div key={f} className="contents">
            <div className="flex items-center justify-end pr-2 font-medium text-ink-2">{f}</div>
            {ORDER.map((t) => {
              const c = get(f, t);
              const dark = Math.sqrt(c.row_pct) > 0.55;
              return (
                <button
                  type="button"
                  key={t}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(c)}
                  onBlur={() => setHover(null)}
                  onClick={() => setHover(c)}
                  aria-label={`From ${f} to ${t}: ${pct(c.row_pct)} (${num(c.transitions)} transitions)`}
                  className={`tnum flex aspect-[4/3] flex-col items-center justify-center rounded-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:aspect-[16/9] ${
                    rollCell(f, t) ? "ring-2 ring-risk-critical" : ""
                  } ${hover === c ? "shadow-md ring-2 ring-ink" : ""}`}
                  style={{ backgroundColor: shade(c.row_pct), color: dark ? "#ffffff" : "#0b0b0b" }}
                >
                  <span className="font-semibold">{pct(c.row_pct, 1)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="tnum mt-3 min-h-[2.75rem] rounded-lg bg-plane px-3 py-2 text-sm text-ink-2" aria-live="polite">
        {hover ? (
          <>
            <span className="font-semibold text-ink">
              {hover.from_bucket} → {hover.to_bucket}:
            </span>{" "}
            {pct(hover.row_pct)} of {num(hover.from_total)} installments in {hover.from_bucket} ({num(hover.transitions)}{" "}
            transitions)
          </>
        ) : (
          <>Hover or tap a cell for counts. Red outline = the 30→60 roll (1-30 now, 31+ next).</>
        )}
      </div>
    </div>
  );
}
