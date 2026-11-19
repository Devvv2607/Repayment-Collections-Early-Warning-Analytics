"""Data-quality assertions. The pipeline stops if any check fails.

Each check reads tables built by sql/*.sql and compares two independent
routes to the same number.
"""
import duckdb

TOL = 1e-6  # relative tolerance for float sums


def _one(con: duckdb.DuckDBPyConnection, query: str):
    return con.execute(query).fetchone()


def check_grain_unique(con):
    rows, distinct_grain = _one(con, "SELECT fact_rows, fact_distinct_grain FROM fact_validation")
    assert rows == distinct_grain, f"fact_installment grain not unique: {rows} rows vs {distinct_grain} keys"
    return f"grain unique: {rows:,} rows = {distinct_grain:,} distinct (SK_ID_PREV, version, number)"


def check_no_double_count(con):
    fact_sched, src_sched, fact_paid, src_paid = _one(
        con,
        "SELECT fact_scheduled_total, source_scheduled_total, fact_paid_total, source_paid_total FROM fact_validation",
    )
    naive = _one(con, "SELECT naive_scheduled_total FROM profile_grain_trap")[0]
    assert abs(fact_sched - src_sched) <= TOL * src_sched, f"scheduled total mismatch {fact_sched} vs {src_sched}"
    assert abs(fact_paid - src_paid) <= TOL * src_paid, f"paid total mismatch {fact_paid} vs {src_paid}"
    assert fact_sched < naive, "fact scheduled total should be below the naive (double-counted) total"
    return f"scheduled total {fact_sched:,.0f} = deduplicated source; naive sum would be {naive:,.0f}"


def check_buckets_sum_to_total(con):
    total = _one(con, "SELECT installments FROM kpi_portfolio")[0]
    bucket_sum = _one(con, "SELECT SUM(installments) FROM kpi_dpd_buckets")[0]
    assert bucket_sum == total, f"DPD buckets sum to {bucket_sum}, expected {total}"
    # Every segment dimension must also partition the full portfolio.
    bad = con.execute(
        f"SELECT segment_dim, SUM(installments) s FROM kpi_segments GROUP BY 1 HAVING s <> {total}"
    ).fetchall()
    assert not bad, f"segment dimensions that do not sum to the total: {bad}"
    return f"DPD bucket counts sum to {total:,}; each segment dimension also sums to the total"


def check_roll_rows_sum_to_one(con):
    rows = con.execute(
        "SELECT from_bucket, SUM(row_pct) FROM roll_matrix GROUP BY from_bucket"
    ).fetchall()
    assert len(rows) == 5, f"expected 5 from-buckets, got {len(rows)}"
    for bucket, s in rows:
        assert abs(s - 1.0) < 1e-9, f"roll-matrix row {bucket} sums to {s}"
    return "all 5 roll-matrix rows sum to 100%"


def check_roll_consistency(con):
    overall = _one(con, "SELECT at_risk_1_30, rolled_31_plus FROM roll_rate_overall")
    matrix = _one(
        con,
        "SELECT SUM(transitions), SUM(transitions) FILTER (WHERE to_order >= 2) FROM roll_matrix WHERE from_bucket = '1-30'",
    )
    assert tuple(overall) == tuple(matrix), f"30->60 numerator/denominator differ: {overall} vs {matrix}"
    bad = con.execute(
        """
        SELECT r.definition, r.threshold
        FROM repeat_roll_results r
        JOIN repeat_roll_results n USING (definition, threshold)
        JOIN repeat_roll_results o USING (definition, threshold)
        WHERE r.group_name = 'repeat_delinquent' AND n.group_name = 'not_repeat' AND o.group_name = 'overall'
          AND (r.n_at_risk + n.n_at_risk <> o.n_at_risk OR o.n_at_risk <> (SELECT at_risk_1_30 FROM roll_rate_overall))
        """
    ).fetchall()
    assert not bad, f"repeat + not-repeat does not equal overall for {bad}"
    return "30->60 roll rate agrees between roll matrix, overall table and repeat-segment split"


def check_powerbi_reconciles(con):
    pbi = _one(con, "SELECT SUM(installments), SUM(scheduled_amt) FROM pbi_fact_installment")
    fact = _one(con, "SELECT COUNT(*), SUM(scheduled_amt) FROM fact_installment")
    assert pbi[0] == fact[0], f"Power BI fact rows {pbi[0]} vs {fact[0]}"
    assert abs(pbi[1] - fact[1]) <= TOL * fact[1], "Power BI scheduled amount does not reconcile"
    trans = _one(con, "SELECT SUM(transitions) FROM pbi_fact_transition")[0]
    matrix = _one(con, "SELECT SUM(transitions) FROM roll_matrix")[0]
    assert trans == matrix, f"Power BI transitions {trans} vs roll matrix {matrix}"
    return "Power BI aggregated facts reconcile to fact_installment and roll_matrix"


CHECKS = [
    check_grain_unique,
    check_no_double_count,
    check_buckets_sum_to_total,
    check_roll_rows_sum_to_one,
    check_roll_consistency,
    check_powerbi_reconciles,
]


def run_all(con) -> list[str]:
    results = []
    for check in CHECKS:
        msg = check(con)
        print(f"  [PASS] {msg}")
        results.append(msg)
    return results


if __name__ == "__main__":
    from db import connect

    run_all(connect())
