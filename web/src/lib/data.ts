// Server-only loaders. Pages are pre-rendered at build time (output: "export"),
// so the JSON files in public/data are read once during `next build`.
// Every number on the site comes from these files: nothing is hardcoded.
import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  DpdBucketRow,
  EarlyWarningRow,
  Kpis,
  Meta,
  RepeatData,
  RollCell,
  SegmentKpi,
} from "./types";

function load<T>(file: string): T {
  const full = path.join(process.cwd(), "public", "data", file);
  return JSON.parse(readFileSync(full, "utf-8")) as T;
}

export const getKpis = () => load<Kpis>("kpis.json");
export const getDpdBuckets = () => load<DpdBucketRow[]>("dpd_buckets.json");
export const getRollMatrix = () => load<RollCell[]>("roll_matrix.json");
export const getSegmentKpis = () => load<{ segments: SegmentKpi[] }>("segment_kpis.json").segments;
export const getRepeat = () => load<RepeatData>("repeat_delinquency.json");
export const getEarlyWarning = () => load<EarlyWarningRow[]>("early_warning.json");
export const getMeta = () => load<Meta>("meta.json");
