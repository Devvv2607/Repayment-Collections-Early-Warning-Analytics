# Repayment & Collections Early-Warning Analytics
# `make all` runs the full pipeline (SQL -> checks -> exports -> charts -> docs -> web JSON).
PY ?= python

.PHONY: all install pipeline exports web clean

all: pipeline

install:
	$(PY) -m pip install -r requirements.txt

pipeline:
	$(PY) src/run_pipeline.py

# Re-run only the Python exports on top of existing DuckDB tables.
exports:
	$(PY) src/run_pipeline.py --skip-sql

web:
	cd web && npm install && npm run build

clean:
	rm -f data/processed/collections.duckdb
