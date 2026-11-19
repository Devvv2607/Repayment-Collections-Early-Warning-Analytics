import type { Metadata } from "next";

import { getMeta } from "@/lib/data";
import { amt, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Methodology · Collections Early-Warning Analytics" };

const DEF_ORDER = [
  "installments",
  "dpd",
  "on_time",
  "coverage",
  "partial",
  "late",
  "dpd_buckets",
  "cure_rate",
  "repeat_delinquent",
  "never_late",
  "severe_history",
  "outstanding",
  "expected_roll",
  "ci",
  "ztest",
];

const LIMITATIONS = [
  ["Relative days, no calendar", "All DAYS_* fields are relative to each borrower's application date. There are no month-end snapshots, vintages or seasonality."],
  ["Installment-level roll, not balance-level", "Roll rates move from one installment to the next on the same loan, not month-on-month balance migration as in a production collections system."],
  ["Survivorship and selection", "These are previous loans of borrowers who came back to Home Credit, so the worst defaulters are under-represented. Loans with no next installment leave the roll denominator."],
  ["Outstanding is a proxy", "Remaining installments × annuity on active loans. Revolving lines have no schedule and only appear in credit amount."],
  ["Missing attributes", "Kaggle test-set borrowers have no application_train record. They are kept and labelled 'Unknown'."],
  ["Observational", "Higher roll rates show where to act, not that acting reduces roll. A randomised holdout is needed."],
];

export default function MethodologyPage() {
  const m = getMeta();
  const g = m.grain_trap;
  const ex = m.trap_example;
  const exPaid = ex.reduce((s, r) => s + r.AMT_PAYMENT, 0);
  const exDpd = Math.max(0, Math.max(...ex.map((r) => r.DAYS_ENTRY_PAYMENT)) - ex[0].DAYS_INSTALMENT);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section>
        <p className="eyebrow">Methodology</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">How the numbers are built</h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-2 sm:text-base">
          All business logic is in SQL (DuckDB). Python only orchestrates and exports. Data refreshed {m.run_date}.
        </p>
      </section>

      <section className="card">
        <h2 className="h-section">1. Grain decision: one row per installment</h2>
        <p className="mt-2 text-sm text-ink-2">
          The source has <span className="tnum font-medium text-ink">{num(g.payment_rows)}</span> payment rows but only{" "}
          <span className="tnum font-medium text-ink">{num(g.installments)}</span> installments.{" "}
          <span className="tnum">{num(g.installments_multi_payment)}</span> installments ({pct(g.share_multi_payment)}) are
          split across several payments (up to {g.max_payment_rows}), and each row repeats the full scheduled amount.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="tnum w-full min-w-[560px] text-sm">
            <caption className="mb-2 text-left text-xs text-ink-muted">
              Example: loan {ex[0].SK_ID_PREV}, installment {ex[0].NUM_INSTALMENT_NUMBER}
            </caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="py-2 pr-3 text-right font-medium">Due day</th>
                <th className="py-2 pr-3 text-right font-medium">Paid day</th>
                <th className="py-2 pr-3 text-right font-medium">AMT_INSTALMENT</th>
                <th className="py-2 text-right font-medium">AMT_PAYMENT</th>
              </tr>
            </thead>
            <tbody>
              {ex.map((r, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-right">{r.DAYS_INSTALMENT}</td>
                  <td className="py-2 pr-3 text-right">{r.DAYS_ENTRY_PAYMENT}</td>
                  <td className="py-2 pr-3 text-right">{r.AMT_INSTALMENT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right">{r.AMT_PAYMENT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr className="font-medium text-ink">
                <td className="py-2 pr-3 text-right" colSpan={2}>
                  Installment grain →
                </td>
                <td className="py-2 pr-3 text-right">
                  {ex[0].AMT_INSTALMENT.toLocaleString("en-US", { minimumFractionDigits: 2 })} (MAX, once)
                </td>
                <td className="py-2 text-right">
                  {exPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })} (SUM) · DPD {exDpd}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-plane p-3">
            <div className="eyebrow">Naive SUM(AMT_INSTALMENT)</div>
            <div className="tnum mt-1 text-xl font-semibold text-risk-critical">{amt(g.naive_scheduled_total)}</div>
          </div>
          <div className="rounded-lg bg-plane p-3">
            <div className="eyebrow">Correct, taken once</div>
            <div className="tnum mt-1 text-xl font-semibold text-ink">{amt(g.correct_scheduled_total)}</div>
          </div>
          <div className="rounded-lg bg-plane p-3">
            <div className="eyebrow">Overstatement</div>
            <div className="tnum mt-1 text-xl font-semibold text-ink">
              {amt(g.overstatement_amt)} (+{pct(g.overstatement_pct)})
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          The same trap inflates partial payments: {pct(g.row_level_partial_share)} of payment rows look partial on
          their own, but at installment grain almost all of them add up to the full amount.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-[#0f1720] p-4 text-xs leading-relaxed text-[#e6edf3]">
          <code>{m.sql_fact_grain}</code>
        </pre>
      </section>

      <section className="card">
        <h2 className="h-section">2. Roll-rate definition (word for word)</h2>
        <blockquote className="mt-3 border-l-4 border-accent bg-accent-soft/50 p-4 text-sm leading-relaxed text-ink">
          {m.roll_definition}
        </blockquote>
      </section>

      <section className="card">
        <h2 className="h-section">3. Leakage-safe history window</h2>
        <p className="mt-2 text-sm text-ink-2">
          For every installment, the borrower&apos;s prior late installments are counted across all their loans, using
          only installments due on <em>earlier days</em>. The frame ends at <code className="rounded bg-plane px-1">1 PRECEDING</code>{" "}
          on the day number (a <code className="rounded bg-plane px-1">RANGE</code> frame), so the current installment and
          anything due the same day are excluded. A prior installment due on day d is known to be late from day d+1, so
          the feature was available at decision time. This snippet is read from the SQL file that ran.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-[#0f1720] p-4 text-xs leading-relaxed text-[#e6edf3]">
          <code>{m.sql_leakage_window}</code>
        </pre>
      </section>

      <section className="card">
        <h2 className="h-section">4. Metric definitions</h2>
        <dl className="mt-3 divide-y divide-line">
          {DEF_ORDER.filter((k) => m.definitions[k]).map((k) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-ink">{m.definitions[k].name}</dt>
              <dd className="text-sm text-ink-2">{m.definitions[k].text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2 className="h-section">5. Limitations</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {LIMITATIONS.map(([t, body]) => (
            <li key={t} className="text-sm">
              <span className="font-semibold text-ink">{t}.</span> <span className="text-ink-2">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="h-section">6. Automated checks (all passed in this run)</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {m.checks.map((c) => (
            <li key={c} className="flex gap-2 text-sm text-ink-2">
              <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded bg-risk-good/15 px-1 text-[10px] font-bold text-[#006300]">
                PASS
              </span>
              <span className="tnum">{c}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 overflow-x-auto">
          <table className="tnum w-full min-w-[480px] text-sm">
            <caption className="mb-2 text-left text-xs text-ink-muted">Source tables</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="py-2 pr-3 text-left font-medium">Table</th>
                <th className="py-2 pr-3 text-right font-medium">Rows</th>
                <th className="py-2 pr-3 text-right font-medium">Loans</th>
                <th className="py-2 text-right font-medium">Borrowers</th>
              </tr>
            </thead>
            <tbody>
              {m.row_counts.map((r) => (
                <tr key={r.table_name} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3">{r.table_name}</td>
                  <td className="py-2 pr-3 text-right">{num(r.row_count)}</td>
                  <td className="py-2 pr-3 text-right">{num(r.distinct_sk_id_prev)}</td>
                  <td className="py-2 text-right">{num(r.distinct_sk_id_curr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
