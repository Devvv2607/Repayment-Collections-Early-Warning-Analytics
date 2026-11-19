-- =====================================================================
-- 06_powerbi_model.sql
-- Purpose : Shape a small star schema for Power BI. The installment fact
--           has ~13M rows, too many for a CSV hand-off, so it is
--           AGGREGATED (not sampled). Aggregating keeps every total exact;
--           sampling would not.
--           The fact keeps additive columns only (counts and sums), so every
--           DAX ratio is computed as SUM / SUM and stays correct under any
--           filter.
-- Grain   : pbi_dim_loan            one row per loan PROFILE
--                                   (contract type x product x channel x size band)
--           pbi_dim_borrower        one row per borrower PROFILE
--                                   (income type x age band x region rating x gender)
--           pbi_dim_dpd_bucket      one row per DPD bucket (with sort order)
--           pbi_fact_installment    one row per (loan profile, borrower profile, DPD bucket)
--           pbi_fact_transition     one row per (loan profile, borrower profile,
--                                   from bucket, to bucket, repeat flag, severe flag)
--           pbi_agg_roll_matrix     = roll_matrix
--           pbi_agg_segment_kpis    one row per (segment_dim, segment_value)
-- Inputs  : fact_installment, repeat_sequence, roll_matrix, kpi_segments,
--           roll_rate_by_segment
-- Outputs : the pbi_* tables above (exported to exports/powerbi/*.csv)
-- =====================================================================

-- ---------- Dimensions --------------------------------------------------
CREATE OR REPLACE TABLE pbi_dim_loan AS
SELECT ROW_NUMBER() OVER (ORDER BY contract_type, product_type, channel, loan_size_band) AS loan_profile_key,
       contract_type, product_type, channel, loan_size_band
FROM (SELECT DISTINCT contract_type, product_type, channel, loan_size_band FROM fact_installment);

CREATE OR REPLACE TABLE pbi_dim_borrower AS
SELECT ROW_NUMBER() OVER (ORDER BY income_type, age_band, region_rating, gender) AS borrower_profile_key,
       income_type, age_band, region_rating, gender
FROM (SELECT DISTINCT income_type, age_band, region_rating, gender FROM fact_installment);

CREATE OR REPLACE TABLE pbi_dim_dpd_bucket AS
SELECT * FROM (VALUES
    (0, '0',     'Current (0 DPD)',  0,   0),
    (1, '1-30',  '1-30 DPD',         1,  30),
    (2, '31-60', '31-60 DPD',       31,  60),
    (3, '61-90', '61-90 DPD',       61,  90),
    (4, '90+',   '90+ DPD',         91, NULL)
) AS t(dpd_bucket_order, dpd_bucket, dpd_bucket_label, dpd_min, dpd_max);

-- ---------- Installment fact (aggregated, additive) ---------------------
CREATE OR REPLACE TABLE pbi_fact_installment AS
SELECT l.loan_profile_key,
       b.borrower_profile_key,
       f.dpd_bucket_order,
       COUNT(*)                   AS installments,
       SUM(f.scheduled_amt)       AS scheduled_amt,
       SUM(f.paid_amt)            AS paid_amt,
       SUM(f.is_on_time::INT)     AS on_time_cnt,
       SUM(f.is_partial::INT)     AS partial_cnt,
       SUM(f.is_unpaid::INT)      AS unpaid_cnt,
       SUM(f.is_late::INT)        AS late_cnt
FROM fact_installment f
JOIN pbi_dim_loan l
  ON  l.contract_type = f.contract_type AND l.product_type = f.product_type
  AND l.channel = f.channel AND l.loan_size_band = f.loan_size_band
JOIN pbi_dim_borrower b
  ON  b.income_type = f.income_type AND b.age_band = f.age_band
  AND b.region_rating = f.region_rating AND b.gender = f.gender
GROUP BY ALL;

-- ---------- Transition fact (for roll-rate measures) --------------------
-- One row per observed transition pattern. repeat_delinquent and
-- severe_history use the same leakage-safe features as 05_repeat_delinquency.sql.
CREATE OR REPLACE TABLE pbi_fact_transition AS
SELECT l.loan_profile_key,
       b.borrower_profile_key,
       r.dpd_bucket_order                 AS from_bucket_order,
       r.next_dpd_bucket_order            AS to_bucket_order,
       (r.prior_late_cnt >= 2)::INT       AS repeat_delinquent,    -- headline segment
       (r.prior_severe_cnt >= 1)::INT     AS severe_history,       -- sensitivity segment
       (r.prior_late_cnt = 0)::INT        AS never_late,
       COUNT(*)                           AS transitions,
       SUM(r.scheduled_amt)               AS from_scheduled_amt
FROM repeat_sequence r
JOIN pbi_dim_loan l
  ON  l.contract_type = r.contract_type AND l.product_type = r.product_type
  AND l.channel = r.channel AND l.loan_size_band = r.loan_size_band
JOIN pbi_dim_borrower b
  ON  b.income_type = r.income_type AND b.age_band = r.age_band
  AND b.region_rating = r.region_rating AND b.gender = r.gender
WHERE r.next_dpd_bucket_order IS NOT NULL
GROUP BY ALL;

-- ---------- Pre-aggregated helper tables --------------------------------
CREATE OR REPLACE TABLE pbi_agg_roll_matrix AS
SELECT * FROM roll_matrix;

CREATE OR REPLACE TABLE pbi_agg_segment_kpis AS
SELECT k.*,
       r.at_risk_1_30,
       r.rolled_31_plus,
       r.roll_30_60
FROM kpi_segments k
LEFT JOIN roll_rate_by_segment r USING (segment_dim, segment_value)
ORDER BY segment_dim, segment_value;
