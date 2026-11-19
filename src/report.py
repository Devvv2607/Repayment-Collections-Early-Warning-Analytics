"""Collect every headline number from the DuckDB tables (single source of truth)
and write RESULTS.md. The same dict feeds the web JSON and the console summary,
so the three can never disagree.
"""
import json
import math
from datetime import date

from db import ROOT

HEADLINE_DEFINITION = "any_late"   # history = prior installments with dpd > 0
HEADLINE_THRESHOLD = 2             # repeat_delinquent = >= 2 prior late installments

ROLL_DEFINITION = (
    "The 30->60 roll rate is the share of installments in DPD bucket '1-30' whose NEXT "
    "installment on the same loan (ordered by NUM_INSTALMENT_NUMBER, latest NUM_INSTALMENT_VERSION "
    "per number) lands in DPD bucket '31-60' or worse ('31-60', '61-90' or '90+'). Installments "
    "with no next installment (the last one observed on a loan) are excluded from the denominator."
)


def records(con, query: str) -> list[dict]:
    """Query -> list of plain-Python dicts (JSON-safe, NaN -> None)."""
    return json.loads(con.execute(query).df().to_json(orient="records"))


def one(con, query: str) -> dict:
    return records(con, query)[0]


def p_value_two_sided(z: float) -> float:
    """Two-sided p-value of a standard-normal z statistic."""
    return math.erfc(abs(z) / math.sqrt(2))


def collect(con, check_msgs: list[str]) -> dict:
    r: dict = {"run_date": date.today().isoformat(), "checks": check_msgs}
    r["row_counts"] = records(con, "SELECT * FROM profile_row_counts")
    r["join_coverage"] = one(con, "SELECT * FROM profile_join_coverage")
    r["grain_trap"] = one(con, "SELECT * FROM profile_grain_trap")
    r["trap_example"] = records(con, "SELECT * FROM profile_trap_example")
    r["validation"] = one(con, "SELECT * FROM fact_validation")
    r["portfolio"] = one(con, "SELECT * FROM kpi_portfolio")
    r["dpd_buckets"] = records(con, "SELECT * FROM kpi_dpd_buckets ORDER BY dpd_bucket_order")
    r["roll_overall"] = one(con, "SELECT * FROM roll_rate_overall")
    r["roll_matrix"] = records(con, "SELECT * FROM roll_matrix ORDER BY from_order, to_order")
    r["segment_kpis"] = records(
        con,
        """SELECT k.*, r.at_risk_1_30, r.rolled_31_plus, r.roll_30_60, r.at_risk_scheduled_amt
           FROM kpi_segments k LEFT JOIN roll_rate_by_segment r USING (segment_dim, segment_value)
           ORDER BY segment_dim, segment_value""",
    )
    r["segment_dpd"] = records(con, "SELECT * FROM kpi_segment_dpd ORDER BY segment_dim, segment_value, dpd_bucket_order")
    r["repeat_groups"] = records(con, "SELECT * FROM repeat_roll_results ORDER BY definition, threshold, group_name")
    ztests = records(con, "SELECT * FROM repeat_ztest ORDER BY definition, threshold")
    for z in ztests:
        z["p_value"] = p_value_two_sided(z["z_stat"])
    r["repeat_ztest"] = ztests
    r["repeat_size"] = records(con, "SELECT * FROM repeat_segment_size ORDER BY definition, threshold")
    r["early_warning"] = records(con, "SELECT * FROM early_warning_segments ORDER BY priority_rank, segment_dim")

    # ---- Headline shortcuts --------------------------------------------
    def pick(rows, **kw):
        return next(x for x in rows if all(x[k] == v for k, v in kw.items()))

    hd, ht = HEADLINE_DEFINITION, HEADLINE_THRESHOLD
    r["headline"] = {
        "definition": hd,
        "threshold": ht,
        "repeat": pick(r["repeat_groups"], definition=hd, threshold=ht, group_name="repeat_delinquent"),
        "not_repeat": pick(r["repeat_groups"], definition=hd, threshold=ht, group_name="not_repeat"),
        "never_late": pick(r["repeat_groups"], definition=hd, threshold=ht, group_name="never_late"),
        "overall": pick(r["repeat_groups"], definition=hd, threshold=ht, group_name="overall"),
        "ztest": pick(ztests, definition=hd, threshold=ht),
        "size": pick(r["repeat_size"], definition=hd, threshold=ht),
        # Sensitivity: >= 1 prior installment more than 30 days late
        "severe": pick(r["repeat_groups"], definition="severe_late", threshold=1, group_name="repeat_delinquent"),
        "severe_never": pick(r["repeat_groups"], definition="severe_late", threshold=1, group_name="never_late"),
        "severe_ztest": pick(ztests, definition="severe_late", threshold=1),
        "severe_size": pick(r["repeat_size"], definition="severe_late", threshold=1),
    }
    r["roll_definition"] = ROLL_DEFINITION
    return r


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def pct(x, d=2):
    return "n/a" if x is None else f"{x * 100:.{d}f}%"


def num(x):
    return "n/a" if x is None else f"{x:,.0f}"


def pval(x):
    """p-values below double precision underflow to 0; say so instead of printing 0."""
    return "< 1e-300" if x == 0 else f"{x:.1e}"


def money(x):
    """Amounts are in the dataset's currency units (not stated by Home Credit)."""
    if x is None:
        return "n/a"
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(x) >= div:
            return f"{x / div:,.2f}{suf}"
    return f"{x:,.0f}"


def _table(headers, rows) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def write_results_md(r: dict) -> None:
    p, g, ro, h = r["portfolio"], r["grain_trap"], r["roll_overall"], r["headline"]
    L: list[str] = []
    L.append("# RESULTS\n")
    L.append(f"_Auto-generated by `src/report.py` on {r['run_date']}. Do not edit by hand; re-run the pipeline._\n")
    L.append("Amounts are in the dataset's original currency units (Home Credit does not state the currency).\n")

    L.append("## 1. Data profile\n")
    L.append(_table(["Table", "Rows", "Distinct SK_ID_PREV", "Distinct SK_ID_CURR"],
                    [[x["table_name"], num(x["row_count"]), num(x["distinct_sk_id_prev"]), num(x["distinct_sk_id_curr"])]
                     for x in r["row_counts"]]))
    jc = r["join_coverage"]
    L.append(f"\n- Installment loans matched to previous_application: {num(jc['loans_matched_prev_app'])} of "
             f"{num(jc['installment_loans'])} ({pct(jc['loans_matched_prev_app'] / jc['installment_loans'])})")
    L.append(f"- Installment borrowers matched to application_train: {num(jc['borrowers_matched_app_train'])} of "
             f"{num(jc['installment_borrowers'])} ({pct(jc['borrowers_matched_app_train'] / jc['installment_borrowers'])}); "
             "the rest are Kaggle test-set borrowers, kept as 'Unknown'.\n")

    L.append("## 2. The grain trap (split payments)\n")
    L.append(_table(["Metric", "Value"], [
        ["Payment rows", num(g["payment_rows"])],
        ["Installments (true grain)", num(g["installments"])],
        ["Installments with >1 payment row", f"{num(g['installments_multi_payment'])} ({pct(g['share_multi_payment'])})"],
        ["Max payment rows for one installment", num(g["max_payment_rows"])],
        ["Correct scheduled total (taken once per installment)", money(g["correct_scheduled_total"])],
        ["Naive SUM(AMT_INSTALMENT) over payment rows", money(g["naive_scheduled_total"])],
        ["Overstatement", f"{money(g['overstatement_amt'])} (+{pct(g['overstatement_pct'])})"],
        ["Payment rows that look 'partial' row by row", pct(g["row_level_partial_share"])],
        ["Installments actually partial at installment grain", pct(p["partial_rate"], 3)],
    ]))

    L.append("\n## 3. Portfolio KPIs\n")
    L.append(_table(["KPI", "Value"], [
        ["Installment records", num(p["installments"])],
        ["Loans", num(p["loans"])],
        ["Borrowers", num(p["borrowers"])],
        ["Scheduled amount", money(p["scheduled_amt"])],
        ["Paid amount", money(p["paid_amt"])],
        ["On-time payment rate", pct(p["on_time_rate"])],
        ["Payment coverage (paid / scheduled)", pct(p["coverage"])],
        ["Partial-payment rate", pct(p["partial_rate"], 3)],
        ["Unpaid rate", pct(p["unpaid_rate"], 3)],
        ["Late rate (dpd > 0)", pct(p["late_rate"])],
        ["Median DPD when late", num(p["median_dpd_when_late"])],
    ]))

    L.append("\n## 4. DPD bucket distribution\n")
    L.append(_table(["Bucket", "Installments", "% count", "Scheduled amt", "% amount"],
                    [[b["dpd_bucket"], num(b["installments"]), pct(b["share_count"]), money(b["scheduled_amt"]),
                      pct(b["share_amount"])] for b in r["dpd_buckets"]]))

    L.append("\n## 5. Roll rates\n")
    L.append(f"**Definition:** {r['roll_definition']}\n")
    L.append(_table(["Metric", "Value"], [
        ["Installments in 1-30 with a next installment", num(ro["at_risk_1_30"])],
        ["...whose next installment is 31+ DPD", num(ro["rolled_31_plus"])],
        ["**Overall 30->60 roll rate**", f"**{pct(ro['roll_30_60'])}**"],
        ["Cure rate (next installment on time)", pct(ro["cure_rate"])],
        ["Stay rate (next installment 1-30 again)", pct(ro["stay_rate"])],
    ]))
    L.append("\nTransition matrix (row % = share of FROM bucket landing in TO bucket):\n")
    order = ["0", "1-30", "31-60", "61-90", "90+"]
    rows = []
    for f in order:
        cells = {x["to_bucket"]: x for x in r["roll_matrix"] if x["from_bucket"] == f}
        rows.append([f] + [pct(cells[t]["row_pct"]) for t in order] + [num(cells["0"]["from_total"])])
    L.append(_table(["From \\ To"] + order + ["n"], rows))

    L.append("\n## 6. Repeat-delinquency early-warning segment\n")
    L.append("Headline segment: **repeat_delinquent = at least 2 prior late installments (dpd > 0)**, counted per "
             "borrower across all loans, using only installments due strictly before the current one.\n")
    rows = []
    for name, key in [("Repeat-delinquent (>=2 prior late)", "repeat"), ("Not repeat (<2)", "not_repeat"),
                      ("Never late before", "never_late"), ("Overall", "overall")]:
        x = h[key]
        rows.append([name, num(x["n_at_risk"]), num(x["n_rolled"]), pct(x["roll_rate"]),
                     f"{pct(x['ci_low'])} to {pct(x['ci_high'])}"])
    L.append(_table(["Group", "At risk (1-30)", "Rolled 31+", "30->60 roll", "95% CI"], rows))
    z = h["ztest"]
    L.append(f"\n- Two-proportion z-test, repeat vs not-repeat: z = {z['z_stat']:.2f}, p = {pval(z['p_value'])}")
    L.append(f"- Lift vs overall: {z['lift_vs_overall']:.2f}x; lift vs not-repeat: {z['lift_vs_not_repeat']:.2f}x")
    L.append(f"- Share of all 1-30 at-risk installments that fall in the segment: {pct(z['share_of_at_risk'])}\n")

    L.append("All thresholds (history = prior installments with dpd > 0):\n")
    L.append(_table(["Threshold", "Repeat roll", "Not-repeat roll", "Lift vs overall", "z", "p", "Share of at-risk"],
                    [[f">= {x['threshold']}", pct(x["p_repeat"]), pct(x["p_not_repeat"]), f"{x['lift_vs_overall']:.2f}x",
                      f"{x['z_stat']:.1f}", pval(x["p_value"]), pct(x["share_of_at_risk"])]
                     for x in r["repeat_ztest"] if x["definition"] == "any_late"]))
    L.append("\nSensitivity (history = prior installments more than 30 days late):\n")
    L.append(_table(["Threshold", "Repeat roll", "Not-repeat roll", "Lift vs overall", "z", "p", "Share of at-risk"],
                    [[f">= {x['threshold']}", pct(x["p_repeat"]), pct(x["p_not_repeat"]), f"{x['lift_vs_overall']:.2f}x",
                      f"{x['z_stat']:.1f}", pval(x["p_value"]), pct(x["share_of_at_risk"])]
                     for x in r["repeat_ztest"] if x["definition"] == "severe_late"]))

    L.append("\n### Opportunity sizing (active loans at day 0)\n")
    L.append("Outstanding = remaining scheduled installments x annuity (proxy; no balance snapshots in the data).\n")
    L.append(_table(["Definition", "Threshold", "Borrowers", "Active loans", "Outstanding", "% of active outstanding", "AMT_CREDIT"],
                    [[x["definition"], f">= {x['threshold']}", num(x["borrowers"]), num(x["active_loans"]),
                      money(x["outstanding_amt"]), pct(x["outstanding_amt"] / x["all_outstanding_amt"]),
                      money(x["credit_amt"])] for x in r["repeat_size"]]))
    s0 = r["repeat_size"][0]
    L.append(f"\nWhole active book: {num(s0['all_active_borrowers'])} borrowers, {num(s0['all_active_loans'])} loans, "
             f"{money(s0['all_outstanding_amt'])} outstanding.\n")

    L.append("## 7. Early-warning segments (repeat-delinquent, ranked by roll rate x outstanding)\n")
    L.append(_table(["Rank", "Dimension", "Segment", "Repeat roll", "All-borrower roll", "Borrowers", "Active loans",
                     "Outstanding", "Expected roll amt"],
                    [[x["priority_rank"], x["segment_dim"], x["segment_value"], pct(x["repeat_roll_rate"]),
                      pct(x["segment_roll_rate_all"]), num(x["borrowers"]), num(x["active_loans"]),
                      money(x["outstanding_amt"]), money(x["expected_roll_amt"])] for x in r["early_warning"][:15]]))

    L.append("\n## 8. 30->60 roll rate by segment\n")
    L.append(_table(["Dimension", "Segment", "Installments", "On-time", "Coverage", "At risk (1-30)", "30->60 roll"],
                    [[x["segment_dim"], x["segment_value"], num(x["installments"]), pct(x["on_time_rate"]),
                      pct(x["coverage"]), num(x["at_risk_1_30"]), pct(x["roll_30_60"])] for x in r["segment_kpis"]]))

    L.append("\n## 9. Data-quality checks\n")
    L += [f"- PASS: {m}" for m in r["checks"]]
    (ROOT / "RESULTS.md").write_text("\n".join(L) + "\n", encoding="utf-8")


def print_summary(r: dict) -> None:
    p, ro, h = r["portfolio"], r["roll_overall"], r["headline"]
    rows = [
        ("Total installment records", num(p["installments"])),
        ("On-time payment rate", pct(p["on_time_rate"])),
        ("Payment coverage", pct(p["coverage"])),
        ("Partial-payment rate", pct(p["partial_rate"], 3)),
    ]
    rows += [(f"DPD {b['dpd_bucket']:>5} (count / amount)", f"{pct(b['share_count'])} / {pct(b['share_amount'])}")
             for b in r["dpd_buckets"]]
    rows += [
        ("Overall 30->60 roll rate", pct(ro["roll_30_60"])),
        ("Repeat-delinquent (>=2) 30->60 roll", pct(h["repeat"]["roll_rate"])),
        ("Never-late 30->60 roll", pct(h["never_late"]["roll_rate"])),
        ("z-test repeat vs not-repeat", f"z={h['ztest']['z_stat']:.1f}, p={h['ztest']['p_value']:.1e}"),
        ("Segment size: borrowers / active loans", f"{num(h['size']['borrowers'])} / {num(h['size']['active_loans'])}"),
        ("Segment outstanding (proxy)", money(h["size"]["outstanding_amt"])),
        ("Sensitivity: >=1 prior 31+ DPD roll", pct(h["severe"]["roll_rate"])),
    ]
    w = max(len(a) for a, _ in rows)
    print("\n" + "=" * (w + 22))
    for a, b in rows:
        print(f"{a:<{w}}  {b}")
    print("=" * (w + 22))
