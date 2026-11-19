-- =====================================================================
-- 04_roll_rates.sql
-- Purpose : Measure how delinquency moves from one installment to the next
--           on the same loan (DPD roll rates).
-- Grain   : roll_sequence          one row per (SK_ID_PREV, NUM_INSTALMENT_NUMBER),
--                                  latest NUM_INSTALMENT_VERSION only
--           roll_matrix            one row per (from_bucket, to_bucket): 25 rows
--           roll_rate_overall      one row
--           roll_rate_by_segment   one row per (segment_dim, segment_value)
-- Inputs  : fact_installment (02_fact_installment.sql)
-- Outputs : roll_sequence, roll_matrix, roll_rate_overall, roll_rate_by_segment
--
-- ROLL-RATE DEFINITION (word for word, also in README.md):
--   The 30->60 roll rate is the share of installments in DPD bucket '1-30'
--   whose NEXT installment on the same loan (ordered by NUM_INSTALMENT_NUMBER,
--   latest NUM_INSTALMENT_VERSION per number) lands in DPD bucket '31-60' or
--   worse ('31-60', '61-90' or '90+'). Installments with no next installment
--   (the last one observed on a loan) are excluded from the denominator.
-- =====================================================================

-- ---------- Step A: one row per installment number, ordered per loan --
-- A re-scheduled installment can exist in several versions. For a clean
-- sequence we keep the latest version of each installment number.
CREATE OR REPLACE TABLE roll_sequence AS
WITH latest_version AS (
    SELECT *
    FROM fact_installment
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY SK_ID_PREV, NUM_INSTALMENT_NUMBER
        ORDER BY NUM_INSTALMENT_VERSION DESC
    ) = 1
)
SELECT SK_ID_PREV,
       SK_ID_CURR,
       NUM_INSTALMENT_NUMBER,
       NUM_INSTALMENT_VERSION,
       due_day,
       scheduled_amt,
       paid_amt,
       dpd,
       is_late,
       dpd_bucket,
       dpd_bucket_order,
       contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band,
       -- The next installment on the same loan (NULL for the last one).
       LEAD(dpd_bucket) OVER w        AS next_dpd_bucket,
       LEAD(dpd_bucket_order) OVER w  AS next_dpd_bucket_order,
       LEAD(scheduled_amt) OVER w     AS next_scheduled_amt
FROM latest_version
WINDOW w AS (PARTITION BY SK_ID_PREV ORDER BY NUM_INSTALMENT_NUMBER);

-- ---------- Step B: full 5x5 transition matrix -------------------------
-- CROSS JOIN of the five buckets guarantees all 25 cells, even empty ones.
CREATE OR REPLACE TABLE roll_matrix AS
WITH buckets AS (
    SELECT * FROM (VALUES ('0', 0), ('1-30', 1), ('31-60', 2), ('61-90', 3), ('90+', 4))
        AS b(dpd_bucket, dpd_bucket_order)
),
transitions AS (
    SELECT dpd_bucket AS from_bucket, next_dpd_bucket AS to_bucket, COUNT(*) AS transitions
    FROM roll_sequence
    WHERE next_dpd_bucket IS NOT NULL
    GROUP BY dpd_bucket, next_dpd_bucket
)
SELECT f.dpd_bucket        AS from_bucket,
       f.dpd_bucket_order  AS from_order,
       t.dpd_bucket        AS to_bucket,
       t.dpd_bucket_order  AS to_order,
       COALESCE(x.transitions, 0) AS transitions,
       SUM(COALESCE(x.transitions, 0)) OVER (PARTITION BY f.dpd_bucket) AS from_total,
       COALESCE(x.transitions, 0)
         / NULLIF(SUM(COALESCE(x.transitions, 0)) OVER (PARTITION BY f.dpd_bucket), 0) AS row_pct
FROM buckets f
CROSS JOIN buckets t
LEFT JOIN transitions x ON x.from_bucket = f.dpd_bucket AND x.to_bucket = t.dpd_bucket
ORDER BY from_order, to_order;

-- ---------- Step C: headline 30->60 roll rate --------------------------
CREATE OR REPLACE TABLE roll_rate_overall AS
SELECT COUNT(*)                                         AS at_risk_1_30,   -- denominator
       COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2) AS rolled_31_plus, -- numerator
       COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2) / COUNT(*) AS roll_30_60,
       COUNT(*) FILTER (WHERE next_dpd_bucket_order = 0) / COUNT(*)  AS cure_rate,      -- next is on time
       COUNT(*) FILTER (WHERE next_dpd_bucket_order = 1) / COUNT(*)  AS stay_rate       -- next also 1-30
FROM roll_sequence
WHERE dpd_bucket = '1-30'
  AND next_dpd_bucket IS NOT NULL;

-- ---------- Step D: 30->60 roll rate by segment ------------------------
CREATE OR REPLACE TABLE roll_rate_by_segment AS
WITH long AS (
    UNPIVOT (
        SELECT SK_ID_PREV, next_dpd_bucket_order, scheduled_amt,
               contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
        FROM roll_sequence
        WHERE dpd_bucket = '1-30' AND next_dpd_bucket IS NOT NULL
    )
    ON contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
    INTO NAME segment_dim VALUE segment_value
)
SELECT segment_dim,
       segment_value,
       COUNT(*)                                            AS at_risk_1_30,
       COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2)  AS rolled_31_plus,
       COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2) / COUNT(*) AS roll_30_60,
       COUNT(DISTINCT SK_ID_PREV)                          AS loans,
       SUM(scheduled_amt)                                  AS at_risk_scheduled_amt
FROM long
GROUP BY segment_dim, segment_value
ORDER BY segment_dim, segment_value;
