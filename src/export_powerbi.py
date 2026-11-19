"""Export the Power BI star schema (built in sql/06_powerbi_model.sql) to CSV."""
from db import ROOT

OUT = ROOT / "exports" / "powerbi"

TABLES = {
    "fact_installment": "pbi_fact_installment",      # aggregated (not sampled), see BUILD_GUIDE.md
    "fact_transition": "pbi_fact_transition",
    "dim_loan": "pbi_dim_loan",
    "dim_borrower": "pbi_dim_borrower",
    "dim_dpd_bucket": "pbi_dim_dpd_bucket",
    "agg_roll_matrix": "pbi_agg_roll_matrix",
    "agg_segment_kpis": "pbi_agg_segment_kpis",
    "agg_repeat_thresholds": "repeat_roll_results",
    "agg_early_warning": "early_warning_segments",
}


def export(con) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, table in TABLES.items():
        con.execute(f"COPY {table} TO '{(OUT / (name + '.csv')).as_posix()}' (HEADER, DELIMITER ',')")
