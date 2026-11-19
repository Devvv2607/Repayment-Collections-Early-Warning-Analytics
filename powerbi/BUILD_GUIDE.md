# Power BI build guide (about 45 minutes)

You will build a 3-page report from the CSVs in `exports/powerbi/`. All numbers must match `RESULTS.md`
(a check table is at the end of `DAX_MEASURES.md`).

## Why the fact table is aggregated, not sampled

The installment fact has 12,951,918 rows. Instead of sampling it (which would distort totals and rare
buckets like 61-90 DPD), the pipeline **aggregates** it to one row per
*loan profile × borrower profile × DPD bucket* (`fact_installment.csv`, ~21k rows) and keeps only additive
columns (counts and sums). Every KPI is then `SUM / SUM`, so totals are **exact** under any slicer. The
trade-off: you cannot drill to a single loan. That is fine for an MIS dashboard, and `checks.py` asserts that
the aggregated tables reconcile to the full fact table.

`dim_loan` and `dim_borrower` are therefore **profile** dimensions (one row per attribute combination), not
one row per loan or borrower.

---

## 0. Load and model (10 min)

1. Open Power BI Desktop → **Blank report**.
2. **Home → Get data → Text/CSV**. Load each file from `exports/powerbi/` (repeat for all 9):
   `fact_installment`, `fact_transition`, `dim_loan`, `dim_borrower`, `dim_dpd_bucket`, `agg_roll_matrix`,
   `agg_segment_kpis`, `agg_repeat_thresholds`, `agg_early_warning`. In each preview click **Load**
   (not Transform).
3. Create the "to bucket" copy: **Home → Transform data** → right-click `dim_dpd_bucket` → **Reference** →
   rename the new query to `dim_to_bucket` → **Close & Apply**.
4. Sort the bucket labels: in **Data view** select `dim_dpd_bucket[dpd_bucket]` → **Column tools → Sort by
   column → dpd_bucket_order**. Repeat for `dim_to_bucket[dpd_bucket]`. Do the same for
   `dim_loan[loan_size_band]` and `dim_borrower[age_band]` (they are prefixed "1:", "2:" … so they already
   sort alphabetically; no action needed there).
5. **Model view** → create relationships (drag column onto column; all *many-to-one, single direction*):
   | From (many) | To (one) |
   |---|---|
   | `fact_installment[loan_profile_key]` | `dim_loan[loan_profile_key]` |
   | `fact_installment[borrower_profile_key]` | `dim_borrower[borrower_profile_key]` |
   | `fact_installment[dpd_bucket_order]` | `dim_dpd_bucket[dpd_bucket_order]` |
   | `fact_transition[loan_profile_key]` | `dim_loan[loan_profile_key]` |
   | `fact_transition[borrower_profile_key]` | `dim_borrower[borrower_profile_key]` |
   | `fact_transition[from_bucket_order]` | `dim_dpd_bucket[dpd_bucket_order]` |
   | `fact_transition[to_bucket_order]` | `dim_to_bucket[dpd_bucket_order]` |
   Delete any relationship Power BI auto-detected between the `agg_*` tables and the dims (they stand alone).
6. Hide the key columns in both facts (right-click → **Hide in report view**).
7. **Home → Enter data** → name `_Measures` → Load. Paste every measure from `DAX_MEASURES.md`.
   Then delete the dummy `Column1` in `_Measures`.
8. **View → Themes**: pick a light theme (e.g. "Default"). Keep one accent colour (blue). Use
   green → amber → red only for DPD buckets.

---

## Page 1: Portfolio Health (10 min)

Rename the page (double-click the tab) to **Portfolio Health**.

1. **Title**: Insert → Text box: "Portfolio Health: installment repayment" (20pt, bold).
2. **KPI cards** (Visualizations → *Card (new)*). Drag in, in this order: `Installments`, `On-Time %`,
   `Coverage %`, `Partial %`, `Roll 30→60 %`. Place them in one row across the top.
   Format → Callout value → 28pt. Expected values: 12,951,918 / 91.44% / 105.53% / 0.018% / 1.29%.
3. **DPD distribution (count)**: *Clustered column chart*. X-axis = `dim_dpd_bucket[dpd_bucket]`,
   Y-axis = `DPD Share (Count) %`. Format → Columns → Color → **fx** → Format style *Rules* based on
   `dim_dpd_bucket[dpd_bucket_order]` (or set each data point colour manually: 0 = green #0CA30C, 1-30 = amber
   #FAB219, 31-60 = orange #EC835A, 61-90 = red #D03B3B, 90+ = dark red #8F1F1F). Turn on **Data labels**.
   Y-axis → Scale type **Log** (otherwise only the 0 bucket is visible).
4. **DPD distribution (amount)**: copy the chart (Ctrl+C / Ctrl+V), swap Y-axis to `DPD Share (Amount) %`.
5. **Slicers** (left column): *Slicer* visuals for `dim_loan[contract_type]`, `dim_loan[channel]`,
   `dim_borrower[income_type]`, `dim_borrower[age_band]`. Format → Slicer settings → Style **Dropdown**.
6. **KPI by segment table**: *Table* visual with `dim_loan[contract_type]`, `Installments`, `On-Time %`,
   `Coverage %`, `Late %`, `Roll 30→60 %`.
7. Add a text box with the one-line headline from `RESULTS.md` §3.

## Page 2: DPD & Roll Rates (12 min)

1. New page → rename **DPD & Roll Rates**.
2. **Transition matrix**: *Matrix* visual. Rows = `dim_dpd_bucket[dpd_bucket]`, Columns =
   `dim_to_bucket[dpd_bucket]`, Values = `Roll Row %`. Format → Cell elements → **Background color: On** →
   fx → Gradient from white (min) to dark blue #104281 (max). Turn **Row subtotals** and **Column subtotals**
   off. Check: row "1-30" reads 51.73% / 46.99% / 0.90% / 0.08% / 0.30%.
3. Add a tooltip: in the matrix, drag `Transitions` into **Tooltips** so hovering shows the count.
4. **Roll rate by segment**: *Clustered bar chart*. Y-axis = `dim_loan[contract_type]`, X-axis =
   `Roll 30→60 %`. Sort descending by the measure (… → Sort axis).
   Add the overall line: select the chart → **Analytics** pane (magnifier icon) → **X-Axis Constant Line** →
   **Add line** → Value **fx** → Field value → `Roll 30→60 % (Overall)` → Line style **Dashed**, Data label
   **On**, text "Overall".
5. Add a **field parameter** so one chart can switch dimension: Modeling → New parameter → **Fields** → add
   `dim_loan[contract_type]`, `dim_borrower[income_type]`, `dim_borrower[age_band]`,
   `dim_borrower[region_rating]`, `dim_loan[loan_size_band]`, `dim_loan[channel]` → tick "Add slicer to this
   page" → Create. Put the parameter field on the bar chart's Y-axis instead of `contract_type`.
6. Cards: `At Risk 1-30` (990,053), `Rolled 31+` (12,731), `Cure Rate %` (51.73%).

## Page 3: Early-Warning Segment (13 min)

1. New page → rename **Early-Warning Segment**.
2. **Comparison chart**: *Clustered column chart* with no axis field. Values: `Never-Late Roll %`,
   `Roll 30→60 %`, `Repeat-Delinq Roll %`, `Severe-History Roll %`. Turn on data labels. Colour the repeat bar
   blue, the others grey, the severe bar dark blue. Expected: 0.97% / 1.29% / 1.37% / 4.00%.
3. Cards: `Repeat Lift vs Overall` (1.07x), `Repeat vs Not-Repeat z` (12.2), `Repeat Roll CI Low` and
   `Repeat Roll CI High` (1.35% to 1.40%).
4. **Threshold table**: *Table* from `agg_repeat_thresholds` with `definition`, `threshold`, `group_name`,
   `n_at_risk`, `roll_rate`, `ci_low`, `ci_high`. Add a slicer on `definition` and one on `threshold`
   (Style: **Tile**) so users can see thresholds 1–5.
5. **Early-warning list**: *Table* from `agg_early_warning` with `priority_rank`, `segment_dim`,
   `segment_value`, `repeat_roll_rate`, `borrowers`, `active_loans`, `outstanding_amt`, `expected_roll_amt`.
   Sort by `priority_rank` ascending. Conditional formatting → `expected_roll_amt` → **Data bars**.
6. **Recommended action** text box. Paste the "Recommendation" paragraph from `README.md`.
7. Footnote text box: "Repeat-delinquent = ≥2 late installments due strictly before the current one
   (no look-ahead). Outstanding = remaining installments × annuity on active loans (proxy)."

## Finish

* **File → Save as** `powerbi/Collections_Early_Warning.pbix`.
* Check every number against the table at the end of `DAX_MEASURES.md`.
* Optional: **File → Export → PDF** for a static copy to attach to applications.
