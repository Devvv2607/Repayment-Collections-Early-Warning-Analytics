"""Write small precomputed aggregates for the static web dashboard.

Runs as the LAST pipeline step and reuses the dict that produced RESULTS.md,
so the website and RESULTS.md always show the same numbers.
No raw or borrower-level data leaves the pipeline: only aggregates.
"""
import json
import re

from db import ROOT, SQL_DIR
from report import DEFINITIONS

OUT = ROOT / "web" / "public" / "data"
MAX_TOTAL_BYTES = 1_000_000


def _leakage_snippet() -> str:
    """Pull the window-function statement straight from the SQL file, so the
    Methodology page always shows the code that actually ran."""
    sql = (SQL_DIR / "05_repeat_delinquency.sql").read_text(encoding="utf-8")
    m = re.search(r"CREATE OR REPLACE TABLE repeat_sequence AS.*?\);", sql, flags=re.S)
    return m.group(0) if m else ""


def _fact_snippet() -> str:
    sql = (SQL_DIR / "02_fact_installment.sql").read_text(encoding="utf-8")
    m = re.search(r"WITH installment AS \(.*?GROUP BY SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER\n\)", sql,
                  flags=re.S)
    return m.group(0) if m else ""


def export(con, r: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p, ro, h = r["portfolio"], r["roll_overall"], r["headline"]

    files = {
        "kpis.json": {
            "portfolio": p,
            "roll_overall": ro,
            "headline": h,
        },
        "dpd_buckets.json": r["dpd_buckets"],
        "roll_matrix.json": r["roll_matrix"],
        "segment_kpis.json": {"segments": r["segment_kpis"], "segment_dpd": r["segment_dpd"]},
        "repeat_delinquency.json": {
            "groups": r["repeat_groups"],
            "ztest": r["repeat_ztest"],
            "size": r["repeat_size"],
            "headline_definition": h["definition"],
            "headline_threshold": h["threshold"],
        },
        "early_warning.json": r["early_warning"],
        "meta.json": {
            "run_date": r["run_date"],
            "row_counts": r["row_counts"],
            "join_coverage": r["join_coverage"],
            "grain_trap": r["grain_trap"],
            "trap_example": r["trap_example"],
            "validation": r["validation"],
            "checks": r["checks"],
            "roll_definition": r["roll_definition"],
            "definitions": {k: {"name": n, "text": t} for k, (n, t) in DEFINITIONS.items()},
            "sql_leakage_window": _leakage_snippet(),
            "sql_fact_grain": _fact_snippet(),
        },
    }
    total = 0
    for name, payload in files.items():
        text = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        (OUT / name).write_text(text, encoding="utf-8")
        total += len(text.encode("utf-8"))
    assert total < MAX_TOTAL_BYTES, f"web JSON is {total:,} bytes; budget is {MAX_TOTAL_BYTES:,}"
    print(f"  web JSON total: {total / 1024:.0f} KB")
