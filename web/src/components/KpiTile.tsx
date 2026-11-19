import InfoTip from "./InfoTip";

interface Props {
  label: string;
  value: string;
  sub?: string;
  definition: { name: string; text: string };
  emphasis?: boolean;
}

export default function KpiTile({ label, value, sub, definition, emphasis }: Props) {
  return (
    <div className={`card flex flex-col gap-1 ${emphasis ? "border-accent/40 bg-accent-soft/40" : ""}`}>
      <div className="flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        <InfoTip title={definition.name} text={definition.text} />
      </div>
      <span className="tnum text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{value}</span>
      {sub && <span className="tnum text-xs text-ink-2">{sub}</span>}
    </div>
  );
}
