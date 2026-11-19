-- =====================================================================
-- 01_profile.sql
-- Purpose : (a) Create thin staging views over the Parquet files (only the
--               columns this project uses).
--           (b) Profile the data: row counts, null rates, distinct keys,
--               join coverage.
--           (c) Expose the key data trap: one installment can have several
--               payment rows (split / partial payments), so a naive
--               SUM(AMT_INSTALMENT) over payment rows double-counts the
--               scheduled amount.
-- Grain   : Staging views keep source grain. Profile tables are summaries.
-- Inputs  : data/processed/installments_payments.parquet
--           data/processed/previous_application.parquet
--           data/processed/application_train.parquet
-- Outputs : views  stg_installments, stg_prev_app, stg_app_train
--           tables profile_row_counts, profile_nulls, profile_join_coverage,
--                  profile_grain_trap, profile_trap_example
-- =====================================================================

-- ---------- (a) Staging views ----------------------------------------
-- Payment-row grain: one row per payment event (NOT per installment).
CREATE OR REPLACE VIEW stg_installments AS
SELECT SK_ID_PREV,
       SK_ID_CURR,
       CAST(NUM_INSTALMENT_VERSION AS INTEGER) AS NUM_INSTALMENT_VERSION,
       NUM_INSTALMENT_NUMBER,
       DAYS_INSTALMENT,       -- due day, relative to the current application date (negative = past)
       DAYS_ENTRY_PAYMENT,    -- day the payment was actually made (same reference point)
       AMT_INSTALMENT,        -- scheduled amount for the installment
       AMT_PAYMENT            -- amount paid in THIS payment row
FROM 'data/processed/installments_payments.parquet';

-- Loan grain: one row per previous loan / application.
CREATE OR REPLACE VIEW stg_prev_app AS
SELECT SK_ID_PREV,
       SK_ID_CURR,
       NAME_CONTRACT_TYPE,
       NAME_CONTRACT_STATUS,
       AMT_CREDIT,
       AMT_ANNUITY,
       NAME_PRODUCT_TYPE,
       CHANNEL_TYPE,
       CNT_PAYMENT
FROM 'data/processed/previous_application.parquet';

-- Borrower grain: one row per current applicant (train set only).
CREATE OR REPLACE VIEW stg_app_train AS
SELECT SK_ID_CURR,
       NAME_INCOME_TYPE,
       DAYS_BIRTH,
       CODE_GENDER,
       REGION_RATING_CLIENT,
       AMT_INCOME_TOTAL,
       NAME_EDUCATION_TYPE
FROM 'data/processed/application_train.parquet';

-- ---------- (b) Row counts and distinct keys -------------------------
CREATE OR REPLACE TABLE profile_row_counts AS
SELECT 'installments_payments' AS table_name,
       COUNT(*)                    AS row_count,
       COUNT(DISTINCT SK_ID_PREV)  AS distinct_sk_id_prev,
       COUNT(DISTINCT SK_ID_CURR)  AS distinct_sk_id_curr
FROM stg_installments
UNION ALL
SELECT 'previous_application', COUNT(*), COUNT(DISTINCT SK_ID_PREV), COUNT(DISTINCT SK_ID_CURR)
FROM stg_prev_app
UNION ALL
SELECT 'application_train', COUNT(*), NULL, COUNT(DISTINCT SK_ID_CURR)
FROM stg_app_train;

-- Null rates for every column we use (one row per table x column).
CREATE OR REPLACE TABLE profile_nulls AS
SELECT 'installments_payments' AS table_name, column_name, CAST(null_percentage AS DOUBLE) AS null_pct
FROM (SUMMARIZE stg_installments)
UNION ALL
SELECT 'previous_application', column_name, CAST(null_percentage AS DOUBLE)
FROM (SUMMARIZE stg_prev_app)
UNION ALL
SELECT 'application_train', column_name, CAST(null_percentage AS DOUBLE)
FROM (SUMMARIZE stg_app_train);

-- How many installment loans / borrowers can be enriched with attributes?
-- (application_train only covers the Kaggle TRAIN borrowers, so some
--  installment borrowers are expected to be unmatched -> LEFT JOIN later.)
CREATE OR REPLACE TABLE profile_join_coverage AS
WITH loans AS (SELECT DISTINCT SK_ID_PREV, SK_ID_CURR FROM stg_installments)
SELECT COUNT(*)                                             AS installment_loans,
       COUNT(p.SK_ID_PREV)                                  AS loans_matched_prev_app,
       COUNT(DISTINCT l.SK_ID_CURR)                         AS installment_borrowers,
       COUNT(DISTINCT a.SK_ID_CURR)                         AS borrowers_matched_app_train
FROM loans l
LEFT JOIN stg_prev_app  p ON p.SK_ID_PREV = l.SK_ID_PREV
LEFT JOIN stg_app_train a ON a.SK_ID_CURR = l.SK_ID_CURR;

-- ---------- (c) The data trap: multiple payment rows per installment --
-- An installment is identified by (SK_ID_PREV, NUM_INSTALMENT_VERSION,
-- NUM_INSTALMENT_NUMBER). AMT_INSTALMENT is repeated on every payment row
-- of that installment, so summing it over payment rows inflates it.
CREATE OR REPLACE TABLE profile_grain_trap AS
WITH per_installment AS (
    SELECT SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER,
           COUNT(*)                        AS payment_rows,
           COUNT(DISTINCT AMT_INSTALMENT)  AS distinct_scheduled_amts,  -- expect 1
           MAX(AMT_INSTALMENT)             AS scheduled_amt,            -- correct: take it once
           SUM(AMT_INSTALMENT)             AS naive_scheduled_amt       -- wrong: repeated per row
    FROM stg_installments
    GROUP BY SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER
)
SELECT COUNT(*)                                              AS installments,
       SUM(payment_rows)                                     AS payment_rows,
       COUNT(*) FILTER (WHERE payment_rows > 1)              AS installments_multi_payment,
       COUNT(*) FILTER (WHERE payment_rows > 1) / COUNT(*)   AS share_multi_payment,
       MAX(payment_rows)                                     AS max_payment_rows,
       COUNT(*) FILTER (WHERE distinct_scheduled_amts > 1)   AS installments_amt_not_constant,
       SUM(scheduled_amt)                                    AS correct_scheduled_total,
       SUM(naive_scheduled_amt)                              AS naive_scheduled_total,
       SUM(naive_scheduled_amt) - SUM(scheduled_amt)         AS overstatement_amt,
       SUM(naive_scheduled_amt) / SUM(scheduled_amt) - 1     AS overstatement_pct
FROM per_installment;

-- One concrete example to show in the README / interview: a single
-- installment settled in three separate payments.
CREATE OR REPLACE TABLE profile_trap_example AS
SELECT *
FROM stg_installments
WHERE SK_ID_PREV = 1083675 AND NUM_INSTALMENT_VERSION = 1 AND NUM_INSTALMENT_NUMBER = 11
ORDER BY DAYS_ENTRY_PAYMENT;
