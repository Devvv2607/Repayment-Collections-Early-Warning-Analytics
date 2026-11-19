"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ACCENT, GRID, INK, INK2, NEUTRAL } from "@/lib/config";
import { amt, num, pct, pval, ratio } from "@/lib/format";
import type { Definition, RepeatData } from "@/lib/types";

import InfoTip from "./InfoTip";

interface Defs {
  [k: string]: { name: string; text: string };
}

const DEF_LABEL: Record<Definition, string> = {
  any_late: "Any late (DPD > 0) · headline",
  severe_late: "Severe (DPD > 30) · sensitivity",
};

export default function EarlyWarningView({ data, defs }: { data: RepeatData; defs: Defs }) {
  const [definition, setDefinition] = useState<Definition>(data.headline_definition);
  const [threshold, setThreshold] = useState<number>(data.headline_threshold);

  const g = (name: string) =>
    data.groups.find((x) => x.definition === definition && x.threshold === threshold && x.group_name === name)!;
  const z = data.ztest.find((x) => x.definition === definition && x.threshold === threshold)!;
  const size = data.size.find((x) => x.definition === definition && x.threshold === threshold)!;
  const repeat = g("repeat_delinquent");
  const overall = g("overall");
  const never = g("never_late");
  const notRepeat = g("not_repeat");

  const histLabel = definition === "any_late" ? "late" : "31+ DPD";
  const chart = [
    { key: "never", label: definition === "any_late" ? "Never late" : "No prior 31+ DPD", r: never, color: NEUTRAL },
    { key: "overall", label: "Overall", r: overall, color: NEUTRAL },
    { key: "repeat", label: `≥ ${threshold} prior ${histLabel}`, r: repeat, color: ACCENT },
  ].map((c) => ({
    label: c.label,
    color: c.color,
    rate: c.r.roll_rate * 100,
    err: [(c.r.roll_rate - c.r.ci_low) * 100, (c.r.ci_high - c.r.roll_rate) * 100],
    n: c.r.n_at_risk,
    rolled: c.r.n_rolled,
    lo: c.r.ci_low,
    hi: c.r.ci_high,
  }));
  // Round the axis to a clean step so ticks read 0, 0.5, 1.0 ... (or 0, 1, 2 ...).
  const rawMax = Math.max(...chart.map((c) => c.hi * 100)) * 1.2;
  const step = rawMax <= 3 ? 0.5 : 1;
  const maxV = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(maxV / step) + 1 }, (_, i) => i * step);
  const significant = Math.abs(z.z_stat) > 1.96;

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">History counts prior installments that were</span>
          <div role="group" aria-label="History definition" className="inline-flex flex-wrap rounded-lg bg-plane p-1">
            {(["any_late", "severe_late"] as Definition[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={definition === d}
                onClick={() => setDefinition(d)}
                className={`seg-btn ${definition === d ? "seg-btn-active" : ""}`}
              >
                {DEF_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">Minimum prior {histLabel} installments</span>
          <div role="group" aria-label="Threshold" className="inline-flex rounded-lg bg-plane p-1">
            {[1, 2, 3, 4, 5].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={threshold === t}
                onClick={() => setThreshold(t)}
                className={`seg-btn tnum min-w-[2.5rem] ${threshold === t ? "seg-btn-active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <h2 className="h-section">30→60 roll rate by delinquency history</h2>
          <p className="text-sm text-ink-2">Error bars show the 95% confidence interval.</p>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 28, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#c3c2b7" }} tick={{ fill: INK2, fontSize: 12 }} interval={0} />
                <YAxis
                  domain={[0, maxV]}
                  ticks={ticks}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fill: INK2, fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(42,120,214,0.06)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof chart)[number];
                    return (
                      <div className="tnum rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
                        <div className="font-semibold text-ink">{d.label}</div>
                        <div className="text-ink-2">30→60 roll: {pct(d.rate / 100)}</div>
                        <div className="text-ink-2">
                          95% CI {pct(d.lo)} to {pct(d.hi)}
                        </div>
                        <div className="text-ink-2">
                          {num(d.rolled)} rolled of {num(d.n)} at risk
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={88} isAnimationActive={false}>
                  {chart.map((c) => (
                    <Cell key={c.label} fill={c.color} />
                  ))}
                  <ErrorBar dataKey="err" width={8} stroke={INK} strokeWidth={1.2} direction="y" />
                  <LabelList
                    dataKey="rate"
                    position="top"
                    offset={14}
                    formatter={(v: number) => `${v.toFixed(2)}%`}
                    style={{ fill: INK, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Stat
            label="Segment roll rate"
            value={pct(repeat.roll_rate)}
            sub={`95% CI ${pct(repeat.ci_low)} to ${pct(repeat.ci_high)}`}
            def={defs.ci}
          />
          <Stat
            label="Lift vs overall"
            value={ratio(z.lift_vs_overall)}
            sub={`${ratio(z.lift_vs_not_repeat)} vs everyone else (${pct(notRepeat.roll_rate)})`}
            def={defs[definition === "any_late" ? "repeat_delinquent" : "severe_history"]}
          />
          <Stat
            label="z-test vs everyone else"
            value={`z = ${z.z_stat.toFixed(1)}`}
            sub={`p ${pval(z.p_value)} · ${significant ? "significant at 5%" : "not significant at 5%"}`}
            def={defs.ztest}
          />
          <Stat
            label="Share of 1-30 installments flagged"
            value={pct(z.share_of_at_risk, 1)}
            sub={`${num(repeat.n_at_risk)} of ${num(overall.n_at_risk)}`}
            def={{
              name: "Coverage of the queue",
              text: "How many of all early-delinquent (1-30 DPD) installments the segment flags. A useful early-warning segment is small and has high lift.",
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-1">
          <h2 className="h-section">Segment size today</h2>
          <InfoTip title={defs.outstanding.name} text={defs.outstanding.text} />
        </div>
        <p className="text-sm text-ink-2">Active loans whose borrower meets the rule at the observation point (day 0).</p>
        <div className="tnum mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SizeFig label="Borrowers" value={num(size.borrowers)} sub={`of ${num(size.all_active_borrowers)} active`} />
          <SizeFig label="Active loans" value={num(size.active_loans)} sub={`of ${num(size.all_active_loans)}`} />
          <SizeFig
            label="Outstanding (proxy)"
            value={amt(size.outstanding_amt)}
            sub={`${pct(size.outstanding_amt / size.all_outstanding_amt, 1)} of active book`}
          />
          <SizeFig label="Credit amount" value={amt(size.credit_amt)} sub={`of ${amt(size.all_credit_amt)}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, def }: { label: string; value: string; sub: string; def: { name: string; text: string } }) {
  return (
    <div className="card !p-4">
      <div className="flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        <InfoTip title={def.name} text={def.text} />
      </div>
      <div className="tnum mt-1 text-2xl font-semibold text-ink">{value}</div>
      <div className="tnum text-xs text-ink-2">{sub}</div>
    </div>
  );
}

function SizeFig({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{value}</div>
      <div className="text-xs text-ink-2">{sub}</div>
    </div>
  );
}
