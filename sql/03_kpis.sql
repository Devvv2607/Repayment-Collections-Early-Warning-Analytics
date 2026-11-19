-- =====================================================================
-- 03_kpis.sql
-- Purpose : Core repayment KPIs, for the whole portfolio and by segment.
--             on-time rate  = on-time installments / all installments
--             coverage      = SUM(paid_amt) / SUM(scheduled_amt)
--             partial rate  = partial installments / all installments
--             late rate     = installments with dpd > 0 / all installments
--             DPD bucket distribution by count and by scheduled amount
-- Grain   : kpi_portfolio      one row
--           kpi_dpd_buckets    one row per DPD bucket
--           kpi_segments       one row per (segment_dim, segment_value)
--           kpi_segment_dpd    one row per (segment_dim, segment_value, dpd_bucket)
-- Inputs  : fact_installment (02_fact_installment.sql)
-- Outputs : kpi_portfolio, kpi_dpd_buckets, kpi_segments, kpi_segment_dpd
-- Note    : Rates are ratios of sums, never averages of segment rates.
-- =====================================================================

-- ---------- Portfolio level -------------------------------------------
CREATE OR REPLACE TABLE kpi_portfolio AS
SELECT COUNT(*)                                   AS installments,
       COUNT(DISTINCT SK_ID_PREV)                 AS loans,
       COUNT(DISTINCT SK_ID_CURR)                 AS borrowers,
       SUM(scheduled_amt)                         AS scheduled_amt,
       SUM(paid_amt)                              AS paid_amt,
       AVG(is_on_time::INT)                       AS on_time_rate,
       SUM(paid_amt) / SUM(scheduled_amt)         AS coverage,
       AVG(is_partial::INT)                       AS partial_rate,
       AVG(is_unpaid::INT)                        AS unpaid_rate,
       AVG(is_late::INT)                          AS late_rate,
       MEDIAN(dpd) FILTER (WHERE is_late)         AS median_dpd_when_late
FROM fact_installment;

-- ---------- DPD bucket distribution -----------------------------------
CREATE OR REPLACE TABLE kpi_dpd_buckets AS
SELECT dpd_bucket,
       dpd_bucket_order,
       COUNT(*)                                          AS installments,
       COUNT(*) / SUM(COUNT(*)) OVER ()                  AS share_count,
       SUM(scheduled_amt)                                AS scheduled_amt,
       SUM(scheduled_amt) / SUM(SUM(scheduled_amt)) OVER () AS share_amount
FROM fact_installment
GROUP BY dpd_bucket, dpd_bucket_order
ORDER BY dpd_bucket_order;

-- ---------- Segment level ---------------------------------------------
-- UNPIVOT turns the seven segment columns into (segment_dim, segment_value)
-- pairs, so ONE GROUP BY produces every segment's KPIs. Each installment
-- appears once per dimension, and therefore once inside any one dimension.
CREATE OR REPLACE TABLE kpi_segments AS
WITH long AS (
    UNPIVOT (
        SELECT SK_ID_PREV, scheduled_amt, paid_amt, is_on_time, is_partial, is_unpaid, is_late,
               contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
        FROM fact_installment
    )
    ON contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
    INTO NAME segment_dim VALUE segment_value
)
SELECT segment_dim,
       segment_value,
       COUNT(*)                            AS installments,
       COUNT(DISTINCT SK_ID_PREV)          AS loans,
       SUM(scheduled_amt)                  AS scheduled_amt,
       SUM(paid_amt)                       AS paid_amt,
       AVG(is_on_time::INT)                AS on_time_rate,
       SUM(paid_amt) / SUM(scheduled_amt)  AS coverage,
       AVG(is_partial::INT)                AS partial_rate,
       AVG(is_late::INT)                   AS late_rate
FROM long
GROUP BY segment_dim, segment_value
ORDER BY segment_dim, segment_value;

-- DPD distribution inside each segment (count and amount weighted).
CREATE OR REPLACE TABLE kpi_segment_dpd AS
WITH long AS (
    UNPIVOT (
        SELECT dpd_bucket, dpd_bucket_order, scheduled_amt,
               contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
        FROM fact_installment
    )
    ON contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
    INTO NAME segment_dim VALUE segment_value
)
SELECT segment_dim,
       segment_value,
       dpd_bucket,
       dpd_bucket_order,
       COUNT(*)                                                               AS installments,
       COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY segment_dim, segment_value) AS share_count,
       SUM(scheduled_amt)                                                     AS scheduled_amt,
       SUM(scheduled_amt) / SUM(SUM(scheduled_amt)) OVER (PARTITION BY segment_dim, segment_value) AS share_amount
FROM long
GROUP BY segment_dim, segment_value, dpd_bucket, dpd_bucket_order
ORDER BY segment_dim, segment_value, dpd_bucket_order;
