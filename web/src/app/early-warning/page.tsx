import type { Metadata } from "next";

import EarlyWarningTable from "@/components/EarlyWarningTable";
import EarlyWarningView from "@/components/EarlyWarningView";
import InfoTip from "@/components/InfoTip";
import { getEarlyWarning, getKpis, getMeta, getRepeat } from "@/lib/data";
import { amt, num, pct, ratio } from "@/lib/format";

export const metadata: Metadata = { title: "Early Warning · Collections Early-Warning Analytics" };

export default function EarlyWarningPage() {
  const { headline: h, roll_overall: ro } = getKpis();
  const repeat = getRepeat();
  const ew = getEarlyWarning();
  const d = getMeta().definitions;
  const sev = h.severe_size;
  const sevShare = sev.outstanding_amt / sev.all_outstanding_amt;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section>
        <p className="eyebrow">Early-warning segment</p>
        <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
          Repeat lateness is a weak signal ({pct(h.repeat.roll_rate)} vs {pct(ro.roll_30_60)}). Past{" "}
          <span className="text-accent-strong">severe</span> delinquency is a strong one ({pct(h.severe.roll_rate)}).
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-2 sm:text-base">
          The headline segment (≥ {h.threshold} prior late installments, counted with no look-ahead) is statistically
          significant but flags {pct(h.ztest.share_of_at_risk, 0)} of all early delinquencies for a{" "}
          {ratio(h.ztest.lift_vs_overall)} lift. Switch the definition below to compare.
        </p>
      </section>

      <EarlyWarningView data={repeat} defs={d} />

      <section className="card">
        <div className="flex items-center gap-1">
          <h2 className="h-section">Top early-warning segments</h2>
          <InfoTip title={d.expected_roll.name} text={d.expected_roll.text} />
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Repeat-delinquent borrowers (≥ {h.threshold} prior late) by segment, ranked by roll rate × outstanding. Segments
          overlap across dimensions, so do not add the rows up. Click a column to sort.
        </p>
        <EarlyWarningTable rows={ew} />
      </section>

      <section className="rounded-xl border-l-4 border-accent bg-surface p-5 shadow-sm ring-1 ring-line sm:p-6">
        <p className="eyebrow text-accent-strong">Recommended action</p>
        <h2 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">
          Call early when a 1-30 DPD borrower has a prior 31+ DPD installment
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-ink-2 sm:text-base">
          <li>
            <span className="tnum font-semibold text-ink">{pct(h.severe.roll_rate)}</span> roll to 31+ DPD, against{" "}
            {pct(ro.roll_30_60)} overall ({ratio(h.severe_ztest.lift_vs_overall, 1)}, z ={" "}
            {h.severe_ztest.z_stat.toFixed(0)}).
          </li>
          <li>
            A workable queue: <span className="tnum font-semibold text-ink">{num(sev.borrowers)}</span> borrowers,{" "}
            {num(sev.active_loans)} active loans, {amt(sev.outstanding_amt)} outstanding ({pct(sevShare, 1)} of the
            active book).
          </li>
          <li>
            Don&apos;t queue on &ldquo;≥ {h.threshold} prior late&rdquo; alone: it would cover {amt(h.size.outstanding_amt)}{" "}
            ({pct(h.size.outstanding_amt / h.size.all_outstanding_amt, 0)} of the book) for a{" "}
            {ratio(h.ztest.lift_vs_overall)} lift.
          </li>
          <li>Validate with a randomised holdout before rollout: this analysis is observational.</li>
        </ul>
      </section>
    </div>
  );
}
