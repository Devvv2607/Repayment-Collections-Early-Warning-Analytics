"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BUCKET_COLORS, GRID, INK2 } from "@/lib/config";
import { amt, num, pct } from "@/lib/format";
import type { DpdBucketRow } from "@/lib/types";

type Mode = "count" | "amount";

export default function DpdChart({ rows }: { rows: DpdBucketRow[] }) {
  const [mode, setMode] = useState<Mode>("count");
  const data = rows.map((r) => ({
    bucket: r.dpd_bucket,
    share: (mode === "count" ? r.share_count : r.share_amount) * 100,
    raw: mode === "count" ? r.installments : r.scheduled_amt,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h-section">DPD bucket distribution</h2>
          <p className="text-sm text-ink-2">Log scale, so the small late buckets stay visible.</p>
        </div>
        <div role="group" aria-label="Weighting" className="inline-flex rounded-lg bg-plane p-1">
          {(["count", "amount"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`seg-btn ${mode === m ? "seg-btn-active" : ""}`}
            >
              {m === "count" ? "By count" : "By amount"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="bucket" tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tick={{ fill: INK2, fontSize: 12 }} />
            <YAxis
              scale="log"
              domain={[0.005, 100]}
              allowDataOverflow
              ticks={[0.01, 0.1, 1, 10, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: INK2, fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(42,120,214,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
                    <div className="font-semibold text-ink">{d.bucket} DPD</div>
                    <div className="tnum text-ink-2">
                      {pct(d.share / 100)} of {mode === "count" ? "installments" : "scheduled amount"}
                    </div>
                    <div className="tnum text-ink-2">{mode === "count" ? `${num(d.raw)} installments` : amt(d.raw)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="share" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket]} />
              ))}
              <LabelList
                dataKey="share"
                position="top"
                formatter={(v: number) => `${v.toFixed(2)}%`}
                style={{ fill: "#0b0b0b", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
