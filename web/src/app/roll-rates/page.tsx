import type { Metadata } from "next";

import InfoTip from "@/components/InfoTip";
import KpiTile from "@/components/KpiTile";
import RollMatrix from "@/components/RollMatrix";
import SegmentRollChart from "@/components/SegmentRollChart";
import { getKpis, getMeta, getRollMatrix, getSegmentKpis } from "@/lib/data";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Roll Rates · Collections Early-Warning Analytics" };

export default function RollRatesPage() {
  const { roll_overall: ro } = getKpis();
  const cells = getRollMatrix();
  const segments = getSegmentKpis();
  const d = getMeta().definitions;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section>
        <p className="eyebrow">DPD &amp; roll rates</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Half of early delinquencies cure on the next installment; {pct(ro.roll_30_60)} get worse.
        </h1>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiTile
          label="30→60 roll rate"
          value={pct(ro.roll_30_60)}
          sub={`${num(ro.rolled_31_plus)} of ${num(ro.at_risk_1_30)} installments`}
          definition={d.roll_30_60}
          emphasis
        />
        <KpiTile label="Cure rate from 1-30" value={pct(ro.cure_rate)} sub="next installment on time" definition={d.cure_rate} />
        <KpiTile
          label="Stay in 1-30"
          value={pct(ro.stay_rate)}
          sub="next installment also 1-30"
          definition={{ name: "Stay rate", text: "Of installments in '1-30' with a next installment, the share whose next installment is also 1-30 DPD." }}
        />
      </section>

      <section className="card">
        <div className="mb-4 flex items-center gap-1">
          <h2 className="h-section">Transition matrix</h2>
          <InfoTip
            title="How to read it"
            text="Each row is the DPD bucket of an installment; each column is the bucket of the NEXT installment on the same loan. Rows sum to 100%."
          />
        </div>
        <RollMatrix cells={cells} />
      </section>

      <section className="card">
        <SegmentRollChart segments={segments} overall={ro.roll_30_60} />
      </section>
    </div>
  );
}
