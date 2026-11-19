import Link from "next/link";

import DpdChart from "@/components/DpdChart";
import KpiTile from "@/components/KpiTile";
import { getDpdBuckets, getKpis, getMeta } from "@/lib/data";
import { amt, num, pct } from "@/lib/format";

export default function OverviewPage() {
  const { portfolio: p, roll_overall: ro, headline: h } = getKpis();
  const buckets = getDpdBuckets();
  const meta = getMeta();
  const d = meta.definitions;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section>
        <p className="eyebrow">Portfolio overview · run {meta.run_date}</p>
        <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-3xl">
          {pct(p.on_time_rate, 1)} of installments are paid on time, and only {pct(ro.roll_30_60)} of 1-30 day
          delinquencies roll to 31+ days. Borrowers with a prior 31+ DPD installment roll{" "}
          {(h.severe.roll_rate / ro.roll_30_60).toFixed(1)}× more often.
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-2 sm:text-base">
          {num(p.installments)} installments across {num(p.loans)} loans and {num(p.borrowers)} borrowers, rebuilt at
          installment grain from {num(meta.grain_trap.payment_rows)} payment rows.{" "}
          <Link href="/early-warning/" className="font-medium text-accent hover:underline">
            See the early-warning segment
          </Link>
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5" aria-label="Key metrics">
        <KpiTile
          label="Installment records"
          value={num(p.installments)}
          sub={`${amt(p.scheduled_amt)} scheduled`}
          definition={d.installments}
        />
        <KpiTile label="On-time" value={pct(p.on_time_rate)} sub={`late ${pct(p.late_rate)}`} definition={d.on_time} />
        <KpiTile label="Coverage" value={pct(p.coverage)} sub={`${amt(p.paid_amt)} paid`} definition={d.coverage} />
        <KpiTile label="Partial" value={pct(p.partial_rate, 3)} sub="of installments" definition={d.partial} />
        <div className="col-span-2 lg:col-span-1">
          <KpiTile
            label="30→60 roll rate"
            value={pct(ro.roll_30_60)}
            sub={`${num(ro.rolled_31_plus)} of ${num(ro.at_risk_1_30)}`}
            definition={d.roll_30_60}
            emphasis
          />
        </div>
      </section>

      <section className="card">
        <DpdChart rows={buckets} />
        <div className="mt-4 overflow-x-auto">
          <table className="tnum w-full min-w-[480px] text-sm">
            <caption className="sr-only">DPD bucket distribution table</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Bucket</th>
                <th className="py-2 pr-3 text-right font-medium">Installments</th>
                <th className="py-2 pr-3 text-right font-medium">% count</th>
                <th className="py-2 pr-3 text-right font-medium">Scheduled</th>
                <th className="py-2 text-right font-medium">% amount</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.dpd_bucket} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 font-medium">{b.dpd_bucket}</td>
                  <td className="py-2 pr-3 text-right">{num(b.installments)}</td>
                  <td className="py-2 pr-3 text-right">{pct(b.share_count)}</td>
                  <td className="py-2 pr-3 text-right">{amt(b.scheduled_amt)}</td>
                  <td className="py-2 text-right">{pct(b.share_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="card">
          <p className="eyebrow">Early lateness mostly cures</p>
          <p className="tnum mt-2 text-2xl font-semibold">{pct(ro.cure_rate)}</p>
          <p className="mt-1 text-sm text-ink-2">
            of 1-30 DPD installments are followed by an on-time one. Median delay when late:{" "}
            {num(p.median_dpd_when_late)} days.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Split payments distort naive sums</p>
          <p className="tnum mt-2 text-2xl font-semibold">+{pct(meta.grain_trap.overstatement_pct)}</p>
          <p className="mt-1 text-sm text-ink-2">
            overstatement ({amt(meta.grain_trap.overstatement_amt)}) if scheduled amounts are summed over payment rows.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Severity is the signal</p>
          <p className="tnum mt-2 text-2xl font-semibold">{pct(h.severe.roll_rate)}</p>
          <p className="mt-1 text-sm text-ink-2">
            30→60 roll for borrowers with a prior 31+ DPD installment, vs {pct(ro.roll_30_60)} overall.
          </p>
        </div>
      </section>
    </div>
  );
}
