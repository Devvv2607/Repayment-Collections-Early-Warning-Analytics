# DAX measures (ready to paste)

Model assumptions (see `BUILD_GUIDE.md` for how to build it):

| Table | Grain | Key columns |
|---|---|---|
| `fact_installment` | loan profile x borrower profile x DPD bucket (aggregated from 12.95M installments) | `loan_profile_key`, `borrower_profile_key`, `dpd_bucket_order` |
| `fact_transition` | loan profile x borrower profile x from-bucket x to-bucket x history flags | `from_bucket_order`, `to_bucket_order`, `repeat_delinquent`, `severe_history`, `never_late` |
| `dim_loan` | one row per loan profile (contract type, product, channel, size band) | `loan_profile_key` |
| `dim_borrower` | one row per borrower profile (income type, age band, region rating, gender) | `borrower_profile_key` |
| `dim_dpd_bucket` | 5 rows | `dpd_bucket_order` |
| `dim_to_bucket` | a copy of `dim_dpd_bucket` for the "next installment" axis | `dpd_bucket_order` |

Every fact column is **additive** (counts and sums), so every ratio below is
`DIVIDE(SUM, SUM)` and stays correct under any slicer. Never average a percentage column.

Create an empty table called `_Measures` (Home → Enter data → name it `_Measures` → Load) and put every
measure in it. For each one: **Modeling → New measure**, paste, then set the format in the Measure tools ribbon.

---

## 1. Volume

```DAX
Installments =
SUM ( fact_installment[installments] )
```
Format: Whole number, thousands separator.

```DAX
Scheduled Amount =
SUM ( fact_installment[scheduled_amt] )
```

```DAX
Paid Amount =
SUM ( fact_installment[paid_amt] )
```
Format both: Decimal number, 0 decimals, thousands separator (or "Display units: Millions").

---

## 2. Repayment KPIs

```DAX
On-Time % =
DIVIDE ( SUM ( fact_installment[on_time_cnt] ), [Installments] )
```
Definition: installments with DPD = 0 **and** paid ≥ 99% of the scheduled amount, divided by all installments.

```DAX
Coverage % =
DIVIDE ( [Paid Amount], [Scheduled Amount] )
```
Definition: Σ paid / Σ scheduled. Can exceed 100% because of prepayments.

```DAX
Partial % =
DIVIDE ( SUM ( fact_installment[partial_cnt] ), [Installments] )
```
Definition: installments with 0 < paid / scheduled < 99%. Format: Percentage, **3** decimals (it is tiny).

```DAX
Late % =
DIVIDE ( SUM ( fact_installment[late_cnt] ), [Installments] )
```

Format all as Percentage, 2 decimals (except Partial %).

---

## 3. DPD distribution

```DAX
DPD Share (Count) % =
DIVIDE (
    [Installments],
    CALCULATE ( [Installments], REMOVEFILTERS ( dim_dpd_bucket ) )
)
```

```DAX
DPD Share (Amount) % =
DIVIDE (
    [Scheduled Amount],
    CALCULATE ( [Scheduled Amount], REMOVEFILTERS ( dim_dpd_bucket ) )
)
```

---

## 4. Roll rates

```DAX
Transitions =
SUM ( fact_transition[transitions] )
```

```DAX
Roll Row % =
DIVIDE (
    [Transitions],
    CALCULATE ( [Transitions], REMOVEFILTERS ( dim_to_bucket ) )
)
```
Use it in the matrix visual (rows = `dim_dpd_bucket`, columns = `dim_to_bucket`). Each row sums to 100%.

```DAX
At Risk 1-30 =
CALCULATE ( [Transitions], fact_transition[from_bucket_order] = 1 )
```

```DAX
Rolled 31+ =
CALCULATE (
    [Transitions],
    fact_transition[from_bucket_order] = 1,
    fact_transition[to_bucket_order] >= 2
)
```

```DAX
Roll 30→60 % =
DIVIDE ( [Rolled 31+], [At Risk 1-30] )
```
Definition (word for word): *the share of installments in DPD bucket '1-30' whose NEXT installment on the same
loan (ordered by NUM_INSTALMENT_NUMBER, latest NUM_INSTALMENT_VERSION per number) lands in DPD bucket '31-60' or
worse ('31-60', '61-90' or '90+'). Installments with no next installment are excluded from the denominator.*

```DAX
Roll 30→60 % (Overall) =
CALCULATE ( [Roll 30→60 %], REMOVEFILTERS ( dim_loan ), REMOVEFILTERS ( dim_borrower ) )
```
Use it as the dashed reference line on segment bar charts.

```DAX
Cure Rate % =
DIVIDE (
    CALCULATE ( [Transitions], fact_transition[from_bucket_order] = 1, fact_transition[to_bucket_order] = 0 ),
    [At Risk 1-30]
)
```

---

## 5. Early-warning segment

```DAX
Repeat-Delinq Roll % =
CALCULATE ( [Roll 30→60 %], fact_transition[repeat_delinquent] = 1 )
```
Repeat-delinquent = at least 2 late installments (DPD > 0, any loan of the borrower) due **strictly before** the
current installment. The flag was computed in SQL with a window ending at `1 PRECEDING`, so there is no look-ahead.

```DAX
Not-Repeat Roll % =
CALCULATE ( [Roll 30→60 %], fact_transition[repeat_delinquent] = 0 )
```

```DAX
Never-Late Roll % =
CALCULATE ( [Roll 30→60 %], fact_transition[never_late] = 1 )
```

```DAX
Severe-History Roll % =
CALCULATE ( [Roll 30→60 %], fact_transition[severe_history] = 1 )
```
Sensitivity segment: at least 1 prior installment more than 30 days late.

```DAX
Repeat Lift vs Overall =
DIVIDE ( [Repeat-Delinq Roll %], CALCULATE ( [Roll 30→60 %], REMOVEFILTERS ( fact_transition[repeat_delinquent] ) ) )
```
Format: Decimal, 2 places, suffix "x" (custom format `0.00"x"`).

```DAX
Repeat At Risk =
CALCULATE ( [At Risk 1-30], fact_transition[repeat_delinquent] = 1 )
```

```DAX
Repeat Roll CI Low =
VAR p = [Repeat-Delinq Roll %]
VAR n = [Repeat At Risk]
RETURN p - 1.96 * SQRT ( p * ( 1 - p ) / n )
```

```DAX
Repeat Roll CI High =
VAR p = [Repeat-Delinq Roll %]
VAR n = [Repeat At Risk]
RETURN p + 1.96 * SQRT ( p * ( 1 - p ) / n )
```

```DAX
Repeat vs Not-Repeat z =
VAR n1 = [Repeat At Risk]
VAR n2 = CALCULATE ( [At Risk 1-30], fact_transition[repeat_delinquent] = 0 )
VAR x1 = CALCULATE ( [Rolled 31+], fact_transition[repeat_delinquent] = 1 )
VAR x2 = CALCULATE ( [Rolled 31+], fact_transition[repeat_delinquent] = 0 )
VAR p1 = DIVIDE ( x1, n1 )
VAR p2 = DIVIDE ( x2, n2 )
VAR pp = DIVIDE ( x1 + x2, n1 + n2 )
RETURN DIVIDE ( p1 - p2, SQRT ( pp * ( 1 - pp ) * ( 1 / n1 + 1 / n2 ) ) )
```
|z| > 1.96 means the gap is significant at the 5% level.

---

## 6. Measures on the pre-aggregated tables (Page 3 table)

`agg_early_warning` is already one row per segment. Use its columns directly (`repeat_roll_rate`,
`outstanding_amt`, `expected_roll_amt`, `priority_rank`) and set **Don't summarize** on `repeat_roll_rate`.

```DAX
Expected Roll Amount =
SUM ( agg_early_warning[expected_roll_amt] )
```

## Check numbers (must match RESULTS.md with no slicers applied)

| Measure | Expected |
|---|---|
| Installments | 12,951,918 |
| On-Time % | 91.44% |
| Coverage % | 105.53% |
| Partial % | 0.018% |
| Roll 30→60 % | 1.29% |
| Repeat-Delinq Roll % | 1.37% |
| Never-Late Roll % | 0.97% |
| Severe-History Roll % | 4.00% |
