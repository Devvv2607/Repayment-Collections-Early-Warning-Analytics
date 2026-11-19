"""Static PNG charts for the README and the deck (matplotlib).

Colour rules: one accent (blue) for "the thing to look at", neutral grey for
context, and the green -> amber -> red status ramp ONLY for DPD severity.
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

from db import ROOT  # noqa: E402

OUT = ROOT / "reports" / "figures"
INK, INK2, MUTED, GRID = "#0b0b0b", "#52514e", "#898781", "#e1e0d9"
ACCENT, NEUTRAL = "#2a78d6", "#b4b2a9"
SEVERITY = {"0": "#0ca30c", "1-30": "#fab219", "31-60": "#ec835a", "61-90": "#d03b3b", "90+": "#8f1f1f"}
BLUES = LinearSegmentedColormap.from_list("blues", ["#fcfcfb", "#cde2fb", "#6da7ec", "#256abf", "#0d366b"])
ORDER = ["0", "1-30", "31-60", "61-90", "90+"]

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Segoe UI", "Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 10, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "axes.facecolor": "white",
})


def _title(ax, title, subtitle=None):
    ax.set_title(title, loc="left", fontsize=13, fontweight="bold", color=INK, pad=22 if subtitle else 10)
    if subtitle:
        ax.text(0, 1.02, subtitle, transform=ax.transAxes, fontsize=9.5, color=INK2, va="bottom")


def dpd_distribution(con):
    df = con.execute("SELECT * FROM kpi_dpd_buckets ORDER BY dpd_bucket_order").df()
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
    for ax, col, label in [(axes[0], "share_count", "Share of installments"),
                           (axes[1], "share_amount", "Share of scheduled amount")]:
        vals = df[col].to_numpy() * 100
        bars = ax.bar(df["dpd_bucket"], vals, color=[SEVERITY[b] for b in df["dpd_bucket"]], width=0.62)
        ax.set_yscale("log")
        ax.set_ylim(0.005, 300)
        ax.grid(axis="y", color=GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        ax.set_yticks([0.01, 0.1, 1, 10, 100], ["0.01%", "0.1%", "1%", "10%", "100%"])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v * 1.25, f"{v:.2f}%", ha="center", fontsize=9, color=INK)
        ax.set_xlabel("DPD bucket")
        _title(ax, label, "log scale")
    fig.suptitle("DPD bucket distribution", x=0.01, ha="left", fontsize=14, fontweight="bold", color=INK)
    fig.tight_layout()
    fig.savefig(OUT / "01_dpd_distribution.png", dpi=160)
    plt.close(fig)


def roll_heatmap(con):
    df = con.execute("SELECT * FROM roll_matrix").df()
    m = df.pivot(index="from_bucket", columns="to_bucket", values="row_pct").loc[ORDER, ORDER].to_numpy()
    n = df.pivot(index="from_bucket", columns="to_bucket", values="transitions").loc[ORDER, ORDER].to_numpy()
    fig, ax = plt.subplots(figsize=(7.2, 5.6))
    ax.imshow(m, cmap=BLUES, vmin=0, vmax=1)
    for i in range(5):
        for j in range(5):
            colour = "white" if m[i, j] > 0.55 else INK
            ax.text(j, i - 0.12, f"{m[i, j] * 100:.1f}%", ha="center", va="center", fontsize=10.5,
                    color=colour, fontweight="bold")
            ax.text(j, i + 0.2, f"n={n[i, j]:,.0f}", ha="center", va="center", fontsize=7.5, color=colour)
    ax.set_xticks(range(5), ORDER)
    ax.set_yticks(range(5), ORDER)
    ax.set_xlabel("Next installment's DPD bucket")
    ax.set_ylabel("Current installment's DPD bucket")
    ax.spines[:].set_visible(False)
    ax.add_patch(plt.Rectangle((1.5, 0.5), 3, 1, fill=False, edgecolor="#d03b3b", linewidth=2))
    _title(ax, "DPD transition matrix (row %)", "Red box = 30->60 roll: 1-30 installments whose next one is 31+ DPD")
    fig.tight_layout()
    fig.savefig(OUT / "02_roll_rate_heatmap.png", dpi=160)
    plt.close(fig)


def roll_by_segment(con):
    overall = con.execute("SELECT roll_30_60 FROM roll_rate_overall").fetchone()[0]
    dims = ["contract_type", "channel", "loan_size_band", "income_type", "age_band", "region_rating"]
    df = con.execute(
        "SELECT * FROM roll_rate_by_segment WHERE at_risk_1_30 >= 1000 AND segment_value <> 'Unknown'"
    ).df()
    fig, axes = plt.subplots(2, 3, figsize=(15, 8.5))
    for ax, dim in zip(axes.flat, dims):
        d = df[df.segment_dim == dim].sort_values("roll_30_60")
        vals = d["roll_30_60"].to_numpy() * 100
        colours = [ACCENT if v > overall * 100 else NEUTRAL for v in vals]
        ax.barh(d["segment_value"], vals, color=colours, height=0.62)
        ax.axvline(overall * 100, color=INK, linestyle="--", linewidth=1)
        ax.text(overall * 100, -0.75, f" overall {overall * 100:.2f}%", fontsize=8, color=INK2, va="top")
        for y, v in enumerate(vals):
            ax.text(v, y, f" {v:.2f}%", va="center", fontsize=8.5, color=INK)
        ax.set_xlim(0, max(vals.max(), overall * 100) * 1.3)
        ax.grid(axis="x", color=GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        ax.set_title(dim.replace("_", " ").title(), loc="left", fontsize=11, fontweight="bold", color=INK)
        ax.tick_params(axis="y", labelsize=8.5)
    fig.suptitle("30->60 roll rate by segment (blue = above overall; segments with >= 1,000 at-risk installments)",
                 x=0.01, ha="left", fontsize=13, fontweight="bold", color=INK)
    fig.tight_layout()
    fig.savefig(OUT / "03_roll_rate_by_segment.png", dpi=160)
    plt.close(fig)


def repeat_comparison(con):
    df = con.execute("""
        SELECT definition, group_name, roll_rate, ci_low, ci_high, n_at_risk
        FROM repeat_roll_results
        WHERE (definition = 'any_late' AND threshold = 2) OR (definition = 'severe_late' AND threshold = 1)
    """).df()

    def get(defn, grp):
        return df[(df.definition == defn) & (df.group_name == grp)].iloc[0]

    rows = [
        ("Never late before", get("any_late", "never_late"), NEUTRAL),
        ("Overall", get("any_late", "overall"), NEUTRAL),
        ("Repeat-delinquent\n(>= 2 prior late, headline)", get("any_late", "repeat_delinquent"), ACCENT),
        ("Sensitivity: >= 1 prior\ninstallment 31+ DPD", get("severe_late", "repeat_delinquent"), "#0d366b"),
    ]
    fig, ax = plt.subplots(figsize=(9, 4.8))
    x = np.arange(len(rows))
    for i, (label, r, colour) in enumerate(rows):
        v = r.roll_rate * 100
        ax.bar(i, v, color=colour, width=0.6)
        ax.errorbar(i, v, yerr=[[v - r.ci_low * 100], [r.ci_high * 100 - v]], color=INK, capsize=5, linewidth=1)
        ax.text(i, r.ci_high * 100 + 0.12, f"{v:.2f}%", ha="center", fontsize=11, fontweight="bold", color=INK)
        ax.text(i, -0.45, f"n={r.n_at_risk:,.0f}", ha="center", fontsize=8, color=MUTED)
    ax.set_xticks(x, [r[0] for r in rows], fontsize=9)
    ax.set_ylabel("30->60 roll rate (%)")
    ax.set_ylim(-0.7, max(r[1].ci_high for r in rows) * 100 * 1.25)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.axhline(0, color="#c3c2b7", linewidth=0.8)
    _title(ax, "30->60 roll rate by delinquency history", "Error bars = 95% confidence interval")
    fig.tight_layout()
    fig.savefig(OUT / "04_repeat_vs_overall.png", dpi=160)
    plt.close(fig)


def make_all(con) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    dpd_distribution(con)
    roll_heatmap(con)
    roll_by_segment(con)
    repeat_comparison(con)
