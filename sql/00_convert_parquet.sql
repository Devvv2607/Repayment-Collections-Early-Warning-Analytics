-- =====================================================================
-- 00_convert_parquet.sql
-- Purpose : One-time conversion of the three raw Kaggle CSVs to Parquet.
--           Parquet is columnar and typed, so every later step reads only
--           the columns it needs and runs in seconds instead of minutes.
-- Grain   : Unchanged from source (one Parquet file per CSV).
-- Inputs  : data/raw/installments_payments.csv
--           data/raw/previous_application.csv
--           data/raw/application_train.csv
-- Outputs : data/processed/<same name>.parquet
-- Note    : run_pipeline.py skips this file if the Parquet files exist.
-- =====================================================================

COPY (SELECT * FROM read_csv('data/raw/installments_payments.csv', header = true, sample_size = -1))
  TO 'data/processed/installments_payments.parquet' (FORMAT parquet);

COPY (SELECT * FROM read_csv('data/raw/previous_application.csv', header = true, sample_size = -1))
  TO 'data/processed/previous_application.parquet' (FORMAT parquet);

COPY (SELECT * FROM read_csv('data/raw/application_train.csv', header = true, sample_size = -1))
  TO 'data/processed/application_train.parquet' (FORMAT parquet);
