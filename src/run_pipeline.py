"""End-to-end pipeline: SQL steps -> checks -> exports -> charts -> docs -> web JSON.

Usage:  python src/run_pipeline.py            (from the project root)
        python src/run_pipeline.py --skip-sql (reuse tables already in the DuckDB file)

Python only orchestrates. Every business rule lives in sql/*.sql.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import ROOT, connect, run_sql_file  # noqa: E402

SQL_STEPS = [
    "01_profile.sql",
    "02_fact_installment.sql",
    "03_kpis.sql",
    "04_roll_rates.sql",
    "05_repeat_delinquency.sql",
    "06_powerbi_model.sql",
]
PARQUET = [
    ROOT / "data/processed/installments_payments.parquet",
    ROOT / "data/processed/previous_application.parquet",
    ROOT / "data/processed/application_train.parquet",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-sql", action="store_true", help="reuse existing DuckDB tables")
    args = parser.parse_args()

    con = connect()
    con.execute("SET enable_progress_bar = false")
    t0 = time.time()

    if not args.skip_sql:
        if not all(p.exists() for p in PARQUET):
            print("[00] converting raw CSVs to Parquet (one-time)...")
            run_sql_file(con, "00_convert_parquet.sql")
        for step in SQL_STEPS:
            t = time.time()
            run_sql_file(con, step)
            print(f"[sql] {step:<28} {time.time() - t:5.1f}s")

    print("[checks]")
    import checks

    check_msgs = checks.run_all(con)

    import charts
    import export_excel
    import export_powerbi
    import export_web_json
    import report

    export_powerbi.export(con)
    print("[export] Power BI CSVs -> exports/powerbi/")
    export_excel.export(con)
    print("[export] Excel MIS -> exports/collections_MIS.xlsx")
    charts.make_all(con)
    print("[charts] PNGs -> reports/figures/")
    results = report.collect(con, check_msgs)
    report.write_results_md(results)
    print("[docs] RESULTS.md")
    export_web_json.export(con, results)
    print("[web] JSON -> web/public/data/")

    report.print_summary(results)
    print(f"\nDone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
