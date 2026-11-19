// Shapes of the JSON files written by src/export_web_json.py.

export type Bucket = "0" | "1-30" | "31-60" | "61-90" | "90+";

export interface Portfolio {
  installments: number;
  loans: number;
  borrowers: number;
  scheduled_amt: number;
  paid_amt: number;
  on_time_rate: number;
  coverage: number;
  partial_rate: number;
  unpaid_rate: number;
  late_rate: number;
  median_dpd_when_late: number;
}

export interface RollOverall {
  at_risk_1_30: number;
  rolled_31_plus: number;
  roll_30_60: number;
  cure_rate: number;
  stay_rate: number;
}

export interface GroupResult {
  definition: Definition;
  threshold: number;
  group_name: "repeat_delinquent" | "not_repeat" | "never_late" | "overall";
  n_at_risk: number;
  n_rolled: number;
  roll_rate: number;
  ci_low: number;
  ci_high: number;
}

export type Definition = "any_late" | "severe_late";

export interface ZTest {
  definition: Definition;
  threshold: number;
  n_repeat: number;
  p_repeat: number;
  n_not_repeat: number;
  p_not_repeat: number;
  p_overall: number;
  lift_vs_overall: number;
  lift_vs_not_repeat: number;
  z_stat: number;
  p_value: number;
  share_of_at_risk: number;
}

export interface SegmentSize {
  definition: Definition;
  threshold: number;
  borrowers: number;
  active_loans: number;
  outstanding_amt: number;
  credit_amt: number;
  all_active_borrowers: number;
  all_active_loans: number;
  all_outstanding_amt: number;
  all_credit_amt: number;
}

export interface Kpis {
  portfolio: Portfolio;
  roll_overall: RollOverall;
  headline: {
    definition: Definition;
    threshold: number;
    repeat: GroupResult;
    not_repeat: GroupResult;
    never_late: GroupResult;
    overall: GroupResult;
    ztest: ZTest;
    size: SegmentSize;
    severe: GroupResult;
    severe_never: GroupResult;
    severe_ztest: ZTest;
    severe_size: SegmentSize;
  };
}

export interface DpdBucketRow {
  dpd_bucket: Bucket;
  dpd_bucket_order: number;
  installments: number;
  share_count: number;
  scheduled_amt: number;
  share_amount: number;
}

export interface RollCell {
  from_bucket: Bucket;
  from_order: number;
  to_bucket: Bucket;
  to_order: number;
  transitions: number;
  from_total: number;
  row_pct: number;
}

export interface SegmentKpi {
  segment_dim: string;
  segment_value: string;
  installments: number;
  loans: number;
  on_time_rate: number;
  coverage: number;
  partial_rate: number;
  late_rate: number;
  at_risk_1_30: number | null;
  rolled_31_plus: number | null;
  roll_30_60: number | null;
}

export interface RepeatData {
  groups: GroupResult[];
  ztest: ZTest[];
  size: SegmentSize[];
  headline_definition: Definition;
  headline_threshold: number;
}

export interface EarlyWarningRow {
  segment_dim: string;
  segment_value: string;
  n_at_risk: number;
  n_rolled: number;
  repeat_roll_rate: number;
  segment_roll_rate_all: number | null;
  borrowers: number;
  active_loans: number;
  outstanding_amt: number;
  expected_roll_amt: number;
  priority_rank: number;
}

export interface Meta {
  run_date: string;
  row_counts: { table_name: string; row_count: number; distinct_sk_id_prev: number | null; distinct_sk_id_curr: number }[];
  join_coverage: {
    installment_loans: number;
    loans_matched_prev_app: number;
    installment_borrowers: number;
    borrowers_matched_app_train: number;
  };
  grain_trap: {
    installments: number;
    payment_rows: number;
    installments_multi_payment: number;
    share_multi_payment: number;
    max_payment_rows: number;
    correct_scheduled_total: number;
    naive_scheduled_total: number;
    overstatement_amt: number;
    overstatement_pct: number;
    row_level_partial_share: number;
  };
  trap_example: {
    SK_ID_PREV: number;
    NUM_INSTALMENT_NUMBER: number;
    DAYS_INSTALMENT: number;
    DAYS_ENTRY_PAYMENT: number;
    AMT_INSTALMENT: number;
    AMT_PAYMENT: number;
  }[];
  checks: string[];
  roll_definition: string;
  definitions: Record<string, { name: string; text: string }>;
  sql_leakage_window: string;
  sql_fact_grain: string;
}
