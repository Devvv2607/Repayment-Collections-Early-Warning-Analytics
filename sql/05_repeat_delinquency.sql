-- =====================================================================
-- 05_repeat_delinquency.sql
-- Purpose : Test whether borrowers with a history of late payments roll
--           from '1-30' into '31-60+' more often, and size that segment.
-- Grain   : repeat_sequence        one row per installment (same as roll_sequence)
--                                  plus prior_late_cnt / prior_severe_cnt
--           repeat_roll_results    one row per (definition, threshold 1-5, group)
--           repeat_ztest           one row per (definition, threshold)
--           loan_current           one row per loan (status at day 0)
--           repeat_segment_size    one row per (definition, threshold)
--           early_warning_segments one row per (segment_dim, segment_value)
-- Inputs  : roll_sequence, roll_rate_by_segment (04_roll_rates.sql),
--           stg_prev_app (01_profile.sql)
-- Outputs : the tables above
--
-- LEAKAGE-SAFE FEATURE
--   prior_late_cnt = number of the BORROWER's installments (across all of
--   their loans) that were late (dpd > 0) and fell due STRICTLY BEFORE the
--   current installment's due day. The window frame ends at 1 PRECEDING
--   on due_day (a RANGE frame, measured in days), so:
--     * the current installment is never counted in its own feature;
--     * installments of other loans due the SAME day are excluded too;
--     * nothing that happens after the current installment is used.
--   A prior installment due on day d is known to be late from day d + 1,
--   which is on or before the current due day, so a collections team
--   would have had this feature at that time.
--
-- SEGMENT: repeat_delinquent = prior_late_cnt >= 2 (HEADLINE threshold).
--          Thresholds 1 to 5 are all reported so the choice is transparent.
--          Sensitivity: the same analysis with history = prior installments
--          more than 30 days late ('severe_late'). Reported separately,
--          never mixed into the headline numbers.
-- =====================================================================

-- ---------- Step A: add the leakage-safe history features --------------
-- prior_late_cnt   : prior installments with dpd > 0  (HEADLINE definition)
-- prior_severe_cnt : prior installments with dpd > 30 (SENSITIVITY check)
CREATE OR REPLACE TABLE repeat_sequence AS
SELECT r.*,
       COALESCE(SUM(is_late::INT) OVER prior_history, 0)    AS prior_late_cnt,
       COALESCE(SUM((dpd > 30)::INT) OVER prior_history, 0) AS prior_severe_cnt
FROM roll_sequence r
WINDOW prior_history AS (
    PARTITION BY SK_ID_CURR
    ORDER BY due_day
    RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING   -- strictly earlier due days only
);

-- ---------- Step B: 30->60 roll rate by history group, thresholds 1-5 --
-- Population = installments in '1-30' that have a next installment
-- (exactly the denominator of the overall 30->60 roll rate).
-- definition = 'any_late'    -> history counts prior installments with dpd > 0
--              'severe_late' -> history counts prior installments with dpd > 30
CREATE OR REPLACE TABLE repeat_roll_results AS
WITH at_risk AS (
    SELECT 'any_late' AS definition, prior_late_cnt AS prior_cnt,
           (next_dpd_bucket_order >= 2)::INT AS rolled
    FROM repeat_sequence
    WHERE dpd_bucket = '1-30' AND next_dpd_bucket IS NOT NULL
    UNION ALL
    SELECT 'severe_late', prior_severe_cnt,
           (next_dpd_bucket_order >= 2)::INT
    FROM repeat_sequence
    WHERE dpd_bucket = '1-30' AND next_dpd_bucket IS NOT NULL
),
thresholds AS (
    SELECT * FROM range(1, 6) AS t(threshold)
),
grouped AS (
    -- Repeat-delinquent at threshold t
    SELECT a.definition, t.threshold, 'repeat_delinquent' AS group_name,
           COUNT(*) AS n_at_risk, SUM(rolled) AS n_rolled
    FROM thresholds t JOIN at_risk a ON a.prior_cnt >= t.threshold
    GROUP BY a.definition, t.threshold
    UNION ALL
    -- Everyone else at threshold t (the complement, used in the z-test)
    SELECT a.definition, t.threshold, 'not_repeat', COUNT(*), SUM(rolled)
    FROM thresholds t JOIN at_risk a ON a.prior_cnt < t.threshold
    GROUP BY a.definition, t.threshold
    UNION ALL
    -- No prior history of this kind (same for every threshold)
    SELECT a.definition, t.threshold, 'never_late', COUNT(*), SUM(rolled)
    FROM thresholds t JOIN at_risk a ON a.prior_cnt = 0
    GROUP BY a.definition, t.threshold
    UNION ALL
    -- Overall (same for every threshold)
    SELECT a.definition, t.threshold, 'overall', COUNT(*), SUM(rolled)
    FROM thresholds t CROSS JOIN at_risk a
    GROUP BY a.definition, t.threshold
)
SELECT definition,
       threshold,
       group_name,
       n_at_risk,
       n_rolled,
       n_rolled / n_at_risk AS roll_rate,
       -- 95% Wald confidence interval for a proportion: p +/- 1.96 * sqrt(p(1-p)/n)
       n_rolled / n_at_risk - 1.96 * SQRT((n_rolled / n_at_risk) * (1 - n_rolled / n_at_risk) / n_at_risk) AS ci_low,
       n_rolled / n_at_risk + 1.96 * SQRT((n_rolled / n_at_risk) * (1 - n_rolled / n_at_risk) / n_at_risk) AS ci_high
FROM grouped
ORDER BY definition, threshold, group_name;

-- ---------- Step C: two-proportion z-test, repeat vs not-repeat --------
-- z = (p1 - p2) / sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
-- |z| > 1.96 means the gap is significant at the 5% level (two-sided).
-- (The exact p-value is computed in Python from z, see src/run_pipeline.py.)
CREATE OR REPLACE TABLE repeat_ztest AS
WITH r AS (SELECT * FROM repeat_roll_results WHERE group_name = 'repeat_delinquent'),
     n AS (SELECT * FROM repeat_roll_results WHERE group_name = 'not_repeat'),
     o AS (SELECT * FROM repeat_roll_results WHERE group_name = 'overall'),
     joined AS (
        SELECT r.definition, r.threshold,
               r.n_at_risk AS n1, r.roll_rate AS p1,
               n.n_at_risk AS n2, n.roll_rate AS p2,
               o.n_at_risk AS n_all, o.roll_rate AS p_all,
               (r.n_rolled + n.n_rolled) / (r.n_at_risk + n.n_at_risk) AS p_pool
        FROM r
        JOIN n USING (definition, threshold)
        JOIN o USING (definition, threshold)
     )
SELECT definition,
       threshold,
       n1          AS n_repeat,
       p1          AS p_repeat,
       n2          AS n_not_repeat,
       p2          AS p_not_repeat,
       p_all       AS p_overall,
       p1 / p_all  AS lift_vs_overall,
       p1 / p2     AS lift_vs_not_repeat,
       p_pool,
       (p1 - p2) / SQRT(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2)) AS z_stat,
       n1 / n_all  AS share_of_at_risk
FROM joined
ORDER BY definition, threshold;

-- ---------- Step D: current status of every loan (for sizing) ----------
-- "Current" = as of the observation point (day 0). A loan is ACTIVE when
-- previous_application.DAYS_TERMINATION = 365243 (Kaggle's "not set"
-- placeholder, i.e. not yet terminated).
-- Outstanding proxy (the dataset has no balance snapshots):
--   remaining_scheduled_amt = remaining installments x annuity
--                           = GREATEST(CNT_PAYMENT - last installment number, 0) * AMT_ANNUITY
-- Revolving lines have no fixed schedule (CNT_PAYMENT = 0), so they only
-- show up in the AMT_CREDIT exposure column.
CREATE OR REPLACE TABLE loan_current AS
WITH loan_last AS (
    SELECT SK_ID_PREV,
           MAX(SK_ID_CURR)            AS SK_ID_CURR,
           MAX(NUM_INSTALMENT_NUMBER) AS last_instalment_number,
           ANY_VALUE(contract_type)   AS contract_type,
           ANY_VALUE(product_type)    AS product_type,
           ANY_VALUE(channel)         AS channel,
           ANY_VALUE(income_type)     AS income_type,
           ANY_VALUE(age_band)        AS age_band,
           ANY_VALUE(region_rating)   AS region_rating,
           ANY_VALUE(loan_size_band)  AS loan_size_band
    FROM roll_sequence
    GROUP BY SK_ID_PREV
),
borrower_history AS (
    -- All late installments to date (everything observed is before day 0).
    SELECT SK_ID_CURR,
           SUM(is_late::INT)    AS late_cnt_to_date,
           SUM((dpd > 30)::INT) AS severe_cnt_to_date
    FROM roll_sequence
    GROUP BY SK_ID_CURR
)
SELECT l.*,
       b.late_cnt_to_date,
       b.severe_cnt_to_date,
       COALESCE(p.DAYS_TERMINATION = 365243, FALSE)                    AS is_active,
       p.AMT_CREDIT                                                    AS amt_credit,
       GREATEST(COALESCE(p.CNT_PAYMENT, 0) - l.last_instalment_number, 0)
         * COALESCE(p.AMT_ANNUITY, 0)                                  AS remaining_scheduled_amt
FROM loan_last l
JOIN borrower_history b USING (SK_ID_CURR)
LEFT JOIN stg_prev_app p USING (SK_ID_PREV);

-- ---------- Step E: size the opportunity at each threshold -------------
CREATE OR REPLACE TABLE repeat_segment_size AS
WITH thresholds AS (SELECT * FROM range(1, 6) AS t(threshold)),
     active AS (
        SELECT 'any_late' AS definition, late_cnt_to_date AS hist_cnt, *
        FROM loan_current WHERE is_active
        UNION ALL
        SELECT 'severe_late', severe_cnt_to_date, *
        FROM loan_current WHERE is_active
     )
SELECT a.definition,
       t.threshold,
       COUNT(DISTINCT a.SK_ID_CURR)   FILTER (WHERE a.hist_cnt >= t.threshold) AS borrowers,
       COUNT(*)                       FILTER (WHERE a.hist_cnt >= t.threshold) AS active_loans,
       SUM(a.remaining_scheduled_amt) FILTER (WHERE a.hist_cnt >= t.threshold) AS outstanding_amt,
       SUM(a.amt_credit)              FILTER (WHERE a.hist_cnt >= t.threshold) AS credit_amt,
       COUNT(DISTINCT a.SK_ID_CURR)                                            AS all_active_borrowers,
       COUNT(*)                                                                AS all_active_loans,
       SUM(a.remaining_scheduled_amt)                                          AS all_outstanding_amt,
       SUM(a.amt_credit)                                                       AS all_credit_amt
FROM thresholds t
CROSS JOIN active a
GROUP BY a.definition, t.threshold
ORDER BY a.definition, t.threshold;

-- ---------- Step F: early-warning segments (headline threshold = 2) ----
-- For each segment value: the 30->60 roll rate of its repeat-delinquent
-- installments (history), and the outstanding amount its repeat-delinquent
-- borrowers hold TODAY (exposure). Ranked by
--   expected_roll_amt = roll rate x exposure
-- = how much outstanding money sits with borrowers who roll that often.
-- Segments with fewer than 300 at-risk installments are excluded as noisy,
-- and 'Unknown' values (no matching application record) are left out.
-- Note: segments from different dimensions overlap (a loan is in one
-- contract type AND one age band), so exposures must not be added up.
CREATE OR REPLACE TABLE early_warning_segments AS
WITH hist AS (
    UNPIVOT (
        SELECT next_dpd_bucket_order,
               contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
        FROM repeat_sequence
        WHERE dpd_bucket = '1-30' AND next_dpd_bucket IS NOT NULL AND prior_late_cnt >= 2
    )
    ON contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
    INTO NAME segment_dim VALUE segment_value
),
hist_rates AS (
    SELECT segment_dim, segment_value,
           COUNT(*)                                           AS n_at_risk,
           COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2) AS n_rolled,
           COUNT(*) FILTER (WHERE next_dpd_bucket_order >= 2) / COUNT(*) AS repeat_roll_rate
    FROM hist
    GROUP BY segment_dim, segment_value
),
current_exposure AS (
    UNPIVOT (
        SELECT SK_ID_CURR, remaining_scheduled_amt,
               contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
        FROM loan_current
        WHERE is_active AND late_cnt_to_date >= 2
    )
    ON contract_type, product_type, channel, income_type, age_band, region_rating, loan_size_band
    INTO NAME segment_dim VALUE segment_value
),
exposure AS (
    SELECT segment_dim, segment_value,
           COUNT(*)                      AS active_loans,
           COUNT(DISTINCT SK_ID_CURR)    AS borrowers,
           SUM(remaining_scheduled_amt)  AS outstanding_amt
    FROM current_exposure
    GROUP BY segment_dim, segment_value
)
SELECT h.segment_dim,
       h.segment_value,
       h.n_at_risk,
       h.n_rolled,
       h.repeat_roll_rate,
       s.roll_30_60                                        AS segment_roll_rate_all,
       COALESCE(e.borrowers, 0)                            AS borrowers,
       COALESCE(e.active_loans, 0)                         AS active_loans,
       COALESCE(e.outstanding_amt, 0)                      AS outstanding_amt,
       h.repeat_roll_rate * COALESCE(e.outstanding_amt, 0) AS expected_roll_amt,
       RANK() OVER (ORDER BY h.repeat_roll_rate * COALESCE(e.outstanding_amt, 0) DESC) AS priority_rank
FROM hist_rates h
LEFT JOIN exposure e USING (segment_dim, segment_value)
LEFT JOIN roll_rate_by_segment s USING (segment_dim, segment_value)
WHERE h.n_at_risk >= 300
  AND h.segment_value <> 'Unknown'
ORDER BY priority_rank;
