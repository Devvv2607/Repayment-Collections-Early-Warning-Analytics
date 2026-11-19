"""Tiny DuckDB helpers shared by every pipeline script.

All business logic lives in sql/*.sql. These helpers only open the database
and execute a SQL file statement by statement.
"""
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "sql"
DB_PATH = ROOT / "data" / "processed" / "collections.duckdb"


def connect() -> duckdb.DuckDBPyConnection:
    """Open (or create) the project DuckDB file. Paths in SQL are relative to ROOT."""
    import os

    os.chdir(ROOT)  # SQL files use paths relative to the project root
    con = duckdb.connect(str(DB_PATH))
    con.execute("PRAGMA threads=8")
    return con


def run_sql_file(con: duckdb.DuckDBPyConnection, name: str) -> None:
    """Execute every statement in sql/<name>."""
    sql = (SQL_DIR / name).read_text(encoding="utf-8")
    con.execute(sql)


def df(con: duckdb.DuckDBPyConnection, query: str):
    """Run a query and return a pandas DataFrame."""
    return con.execute(query).df()
