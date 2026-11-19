"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ACCENT, GRID, INK, INK2, NEUTRAL } from "@/lib/config";
import { DIM_LABELS, cleanValue, num, pct } from "@/lib/format";
import type { SegmentKpi } from "@/lib/types";

const DIMS = ["contract_type", "income_type", "age_band", "region_rating", "loan_size_band", "channel"];
const MIN_AT_RISK = 300;

export default function SegmentRollChart({ segments, overall }: { segments: SegmentKpi[]; overall: number }) {
  const [dim, setDim] = useState("contract_type");

  const { data, hidden } = useMemo(() => {
    const all = segments.filter((s) => s.segment_dim === dim && s.segment_value !== "Unknown");
    const kept = all.filter((s) => (s.at_risk_1_30 ?? 0) >= MIN_AT_RISK);
    return {
      data: kept
        .map((s) => ({
          name: cleanValue(s.segment_value),
          roll: (s.roll_30_60 ?? 0) * 100,
          atRisk: s.at_risk_1_30 ?? 0,
          rolled: s.rolled_31_plus ?? 0,
          onTime: s.on_time_rate,
        }))
        .sort((a, b) => b.roll - a.roll),
      hidden: all.length - kept.length,
    };
  }, [segments, dim]);

  const height = Math.max(220, data.length * 44 + 40);
  const maxV = Math.max(overall * 100, ...data.map((d) => d.roll)) * 1.25;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="h-section">30→60 roll rate by segment</h2>
          <p className="text-sm text-ink-2">
            Blue bars sit above the overall rate (dashed line, {pct(overall)}).
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Segment dimension
          <select
            value={dim}
            onChange={(e) => setDim(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {DIMS.map((d) => (
              <option key={d} value={d}>
                {DIM_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 20, right: 56, left: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              domain={[0, maxV]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: INK2, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={124}
              tickLine={false}
              axisLine={{ stroke: "#c3c2b7" }}
              tick={{ fill: INK2, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(42,120,214,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="tnum rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
                    <div className="font-semibold text-ink">{d.name}</div>
                    <div className="text-ink-2">30→60 roll: {pct(d.roll / 100)}</div>
                    <div className="text-ink-2">
                      {num(d.rolled)} rolled of {num(d.atRisk)} at risk
                    </div>
                    <div className="text-ink-2">On-time: {pct(d.onTime)}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              x={overall * 100}
              stroke={INK}
              strokeDasharray="4 4"
              label={{ value: `overall ${pct(overall)}`, position: "top", fill: INK2, fontSize: 11 }}
            />
            <Bar dataKey="roll" radius={[0, 4, 4, 0]} maxBarSize={26} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.roll > overall * 100 ? ACCENT : NEUTRAL} />
              ))}
              <LabelList
                dataKey="roll"
                position="right"
                formatter={(v: number) => `${v.toFixed(2)}%`}
                style={{ fill: INK, fontSize: 12, fontVariantNumeric: "tabular-nums" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          {hidden} segment{hidden > 1 ? "s" : ""} with fewer than {MIN_AT_RISK} at-risk installments hidden as too
          noisy. &quot;Unknown&quot; (no matching application record) is excluded.
        </p>
      )}
    </div>
  );
}
