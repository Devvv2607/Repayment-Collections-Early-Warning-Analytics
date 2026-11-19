-- =====================================================================
-- 02_fact_installment.sql
-- Purpose : Build the installment-grain fact table: one row per scheduled
--           installment with what was paid, when, days-past-due (DPD),
--           payment flags, DPD bucket, and loan + borrower attributes.
-- Grain   : One row per (SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER).
-- Inputs  : stg_installments, stg_prev_app, stg_app_train (from 01_profile.sql)
-- Outputs : fact_installment, fact_validation
--
-- Key decisions
--  * scheduled_amt = MAX(AMT_INSTALMENT). The scheduled amount is repeated
--    on every payment row of an installment (constant within the grain,
--    verified in profile_grain_trap), so we take it ONCE. Never SUM it.
--  * paid_amt = SUM(AMT_PAYMENT): payments really are additive.
--  * dpd = GREATEST(last_pay_day - DAYS_INSTALMENT, 0).
--    We use the LAST payment date because that is when the installment was
--    fully settled. With split payments the first payment can be on time
--    while the balance arrives weeks later. For partially paid
--    installments, "last payment" is the last payment we observe.
--  * Installments with NO payment row at all (DAYS_ENTRY_PAYMENT null) are
--    aged to the observation point, day 0 (the current application date
--    that all DAYS_* columns are relative to): dpd = 0 - DAYS_INSTALMENT.
--  * coverage = paid_amt / scheduled_amt (NULL when scheduled_amt = 0).
-- =====================================================================

CREATE OR REPLACE TABLE fact_installment AS
WITH installment AS (
    -- Collapse payment rows to the installment grain.
    SELECT SK_ID_PREV,
           NUM_INSTALMENT_VERSION,
           NUM_INSTALMENT_NUMBER,
           MAX(SK_ID_CURR)               AS SK_ID_CURR,      -- constant per loan
           MAX(DAYS_INSTALMENT)          AS due_day,         -- constant per installment
           MAX(AMT_INSTALMENT)           AS scheduled_amt,   -- constant per installment: take once
           COALESCE(SUM(AMT_PAYMENT), 0) AS paid_amt,        -- payments add up
           COUNT(AMT_PAYMENT)            AS payment_rows,
           MIN(DAYS_ENTRY_PAYMENT)       AS first_pay_day,
           MAX(DAYS_ENTRY_PAYMENT)       AS last_pay_day
    FROM stg_installments
    GROUP BY SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER
),
measured AS (
    SELECT *,
           GREATEST(COALESCE(last_pay_day, 0) - due_day, 0) AS dpd,
           paid_amt / NULLIF(scheduled_amt, 0)              AS coverage
    FROM installment
)
SELECT
    m.SK_ID_PREV,
    m.SK_ID_CURR,
    m.NUM_INSTALMENT_VERSION,
    m.NUM_INSTALMENT_NUMBER,
    m.due_day,
    m.scheduled_amt,
    m.paid_amt,
    m.payment_rows,
    m.first_pay_day,
    m.last_pay_day,
    m.dpd,
    m.coverage,
    -- Payment flags ---------------------------------------------------
    COALESCE(m.dpd = 0 AND m.coverage >= 0.99, FALSE)     AS is_on_time,
    COALESCE(m.coverage > 0 AND m.coverage < 0.99, FALSE) AS is_partial,
    (m.paid_amt = 0)                                      AS is_unpaid,
    (m.dpd > 0)                                           AS is_late,
    -- DPD bucket and its sort order -----------------------------------
    CASE WHEN m.dpd = 0   THEN '0'
         WHEN m.dpd <= 30 THEN '1-30'
         WHEN m.dpd <= 60 THEN '31-60'
         WHEN m.dpd <= 90 THEN '61-90'
         ELSE '90+' END                                   AS dpd_bucket,
    CASE WHEN m.dpd = 0   THEN 0
         WHEN m.dpd <= 30 THEN 1
         WHEN m.dpd <= 60 THEN 2
         WHEN m.dpd <= 90 THEN 3
         ELSE 4 END                                       AS dpd_bucket_order,
    -- Loan attributes (previous_application) ---------------------------
    COALESCE(p.NAME_CONTRACT_TYPE, 'Unknown')             AS contract_type,
    COALESCE(p.NAME_PRODUCT_TYPE,  'Unknown')             AS product_type,
    COALESCE(p.CHANNEL_TYPE,       'Unknown')             AS channel,
    p.AMT_CREDIT                                          AS loan_amt_credit,
    p.AMT_ANNUITY                                         AS loan_amt_annuity,
    p.CNT_PAYMENT                                         AS loan_cnt_payment,
    CASE WHEN p.AMT_CREDIT IS NULL  THEN 'Unknown'
         WHEN p.AMT_CREDIT < 50000  THEN '1: <50k'
         WHEN p.AMT_CREDIT < 150000 THEN '2: 50k-150k'
         WHEN p.AMT_CREDIT < 300000 THEN '3: 150k-300k'
         WHEN p.AMT_CREDIT < 600000 THEN '4: 300k-600k'
         ELSE '5: 600k+' END                              AS loan_size_band,
    -- Borrower attributes (application_train). LEFT JOIN keeps borrowers
    -- who are only in the Kaggle test set; they are labelled 'Unknown'.
    COALESCE(a.NAME_INCOME_TYPE, 'Unknown')               AS income_type,
    COALESCE(a.CODE_GENDER, 'Unknown')                    AS gender,
    COALESCE(a.NAME_EDUCATION_TYPE, 'Unknown')            AS education,
    COALESCE(CAST(a.REGION_RATING_CLIENT AS VARCHAR), 'Unknown') AS region_rating,
    a.AMT_INCOME_TOTAL                                    AS income_total,
    CASE WHEN a.DAYS_BIRTH IS NULL        THEN 'Unknown'
         WHEN -a.DAYS_BIRTH / 365.25 < 25 THEN '1: <25'
         WHEN -a.DAYS_BIRTH / 365.25 < 35 THEN '2: 25-34'
         WHEN -a.DAYS_BIRTH / 365.25 < 45 THEN '3: 35-44'
         WHEN -a.DAYS_BIRTH / 365.25 < 55 THEN '4: 45-54'
         ELSE '5: 55+' END                                AS age_band
FROM measured m
LEFT JOIN stg_prev_app  p ON p.SK_ID_PREV = m.SK_ID_PREV
LEFT JOIN stg_app_train a ON a.SK_ID_CURR = m.SK_ID_CURR;

-- ---------- Validation (asserted again in src/checks.py) --------------
CREATE OR REPLACE TABLE fact_validation AS
WITH dedup_source AS (
    -- Independent route to the true scheduled total: distinct installments.
    SELECT DISTINCT SK_ID_PREV, NUM_INSTALMENT_VERSION, NUM_INSTALMENT_NUMBER, AMT_INSTALMENT
    FROM stg_installments
)
SELECT
    (SELECT COUNT(*) FROM fact_installment)                                   AS fact_rows,
    (SELECT COUNT(*) FROM (SELECT DISTINCT SK_ID_PREV, NUM_INSTALMENT_VERSION,
                                  NUM_INSTALMENT_NUMBER FROM fact_installment)) AS fact_distinct_grain,
    (SELECT COUNT(*) FROM dedup_source)                                       AS source_installments,
    (SELECT SUM(scheduled_amt) FROM fact_installment)                         AS fact_scheduled_total,
    (SELECT SUM(AMT_INSTALMENT) FROM dedup_source)                            AS source_scheduled_total,
    (SELECT SUM(AMT_PAYMENT) FROM stg_installments)                           AS source_paid_total,
    (SELECT SUM(paid_amt) FROM fact_installment)                              AS fact_paid_total,
    (SELECT COUNT(*) FROM fact_installment WHERE last_pay_day IS NULL)        AS installments_no_payment,
    (SELECT COUNT(*) FROM fact_installment WHERE scheduled_amt = 0)           AS installments_zero_scheduled;
