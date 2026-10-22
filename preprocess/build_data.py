"""
Pre-processing: turn one month of UCI Online Retail II order lines into
public/data/warehouse.json for the warehouse digital twin.

Usage:
    python preprocess/build_data.py                 # default month 2010-11
    python preprocess/build_data.py --month 2011-03

Definitions (also stated in the README):
    * One order = one Invoice.
    * One pick  = one order line (we count lines, not Quantity).
      If the same product appears on several lines of one invoice we merge them
      into a single pick, because the picker visits that slot only once.
"""

import argparse
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_FILE = ROOT / "data" / "raw" / "online_retail_II.xlsx"
OUT_FILE = ROOT / "public" / "data" / "warehouse.json"

TOP_N = 100  # number of products we put on the picking floor

# Each sheet covers roughly Dec of year 1 to early Dec of year 2.
SHEETS = {
    "Year 2009-2010": ("2009-12", "2010-12"),
    "Year 2010-2011": ("2010-12", "2011-12"),
}

# Real product codes: 5 digits plus up to 2 letters (e.g. 85123A).
# This drops POST, DOT, M, D, BANK CHARGES, AMAZONFEE, ADJUST, TEST, gift_ ...
PRODUCT_CODE = re.compile(r"^\d{5}[A-Za-z]{0,2}$")


def sheets_for_month(month: str) -> list[str]:
    """Return the sheet names whose date range contains the month."""
    return [name for name, (start, end) in SHEETS.items() if start <= month <= end]


def load_month(month: str) -> tuple[pd.DataFrame, dict]:
    sheets = sheets_for_month(month)
    if not sheets:
        raise SystemExit(f"Month {month} is not covered by the dataset (2009-12 .. 2011-12).")

    frames = []
    for name in sheets:
        print(f"Reading sheet '{name}' (this takes a minute)...")
        frames.append(pd.read_excel(RAW_FILE, sheet_name=name, dtype={"Invoice": str, "StockCode": str}))
    df = pd.concat(frames, ignore_index=True)

    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])
    df = df[df["InvoiceDate"].dt.strftime("%Y-%m") == month]

    # Early Dec 2010 appears in both sheets: drop rows that came from both.
    # (Only when two sheets were read; identical rows inside one sheet are
    # handled later by the per-invoice merge step.)
    overlap = 0
    if len(frames) > 1:
        before = len(df)
        df = df.drop_duplicates()
        overlap = before - len(df)

    return df, {"sheets_read": sheets, "duplicate_rows_across_sheets": int(overlap)}


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, list[dict]]:
    """Apply the filters one by one and record how many rows each removed."""
    steps = []

    def apply(name: str, keep_mask):
        nonlocal df
        before = len(df)
        df = df[keep_mask]
        steps.append({"filter": name, "removed": before - len(df), "rows_after": len(df)})

    df["Invoice"] = df["Invoice"].astype(str).str.strip()
    df["StockCode"] = df["StockCode"].astype(str).str.strip()

    apply("cancelled invoices (Invoice starts with 'C')", ~df["Invoice"].str.startswith("C"))
    apply("Quantity <= 0", df["Quantity"] > 0)
    apply("Price <= 0", df["Price"] > 0)
    apply("non-product StockCode", df["StockCode"].str.match(PRODUCT_CODE))
    return df, steps


def short_description(text: str, limit: int = 40) -> str:
    text = " ".join(str(text).split()).title()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default="2010-11", help="YYYY-MM, default 2010-11")
    args = parser.parse_args()

    if not RAW_FILE.exists():
        raise SystemExit(f"Missing {RAW_FILE}. Download it first (see README).")

    df, load_info = load_month(args.month)
    raw_rows = len(df)
    print(f"\nRows in {args.month}: {raw_rows}")

    df, steps = clean(df)
    for s in steps:
        print(f"  - {s['filter']}: removed {s['removed']}, {s['rows_after']} left")

    # Merge repeated lines of the same product inside one invoice (= one visit).
    before = len(df)
    lines = df.drop_duplicates(subset=["Invoice", "StockCode"])
    merged = before - len(lines)
    print(f"  - merged repeated product lines within an invoice: {merged}, {len(lines)} left")

    # Pick count per product = number of order lines for it.
    counts = lines.groupby("StockCode").size().reset_index(name="picks")
    # Sort by picks desc, then code asc so ties are deterministic.
    counts = counts.sort_values(["picks", "StockCode"], ascending=[False, True]).head(TOP_N)
    top_codes = set(counts["StockCode"])

    # Most common description per product (descriptions vary slightly).
    desc = (
        lines[lines["StockCode"].isin(top_codes)]
        .groupby("StockCode")["Description"]
        .agg(lambda s: s.dropna().mode().iat[0] if not s.dropna().empty else "")
    )

    products = [
        {"code": row.StockCode, "desc": short_description(desc.get(row.StockCode, "")),
         "picks": int(row.picks), "rank": rank}
        for rank, row in enumerate(counts.itertuples(index=False), start=1)
    ]

    # Keep only lines for top products; orders that become empty disappear.
    top_lines = lines[lines["StockCode"].isin(top_codes)].sort_values(["InvoiceDate", "Invoice", "StockCode"])
    orders = []
    for invoice, group in top_lines.groupby("Invoice", sort=False):
        orders.append({
            "id": invoice,
            "t": group["InvoiceDate"].iloc[0].strftime("%Y-%m-%dT%H:%M"),
            "items": group["StockCode"].tolist(),
        })
    orders.sort(key=lambda o: (o["t"], o["id"]))

    all_orders_after_filters = lines["Invoice"].nunique()
    summary = {
        **load_info,
        "raw_rows_in_month": raw_rows,
        "filters": steps,
        "merged_duplicate_lines": int(merged),
        "clean_lines": int(len(lines)),
        "clean_orders": int(all_orders_after_filters),
        "distinct_products": int(lines["StockCode"].nunique()),
        "top_n": TOP_N,
        "orders": len(orders),
        "lines": int(len(top_lines)),
        "orders_dropped_empty": int(all_orders_after_filters - len(orders)),
        "share_of_lines_covered_by_top_n": round(len(top_lines) / len(lines), 4),
    }

    out = {"month": args.month, "products": products, "orders": orders, "summary": summary}
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, separators=(",", ":")))

    print("\n=== Summary ===")
    print(f"Distinct products after cleaning: {summary['distinct_products']}")
    print(f"Top {TOP_N} products cover {summary['share_of_lines_covered_by_top_n']:.1%} of clean lines")
    print(f"Orders kept: {summary['orders']} (dropped {summary['orders_dropped_empty']} with no top-{TOP_N} product)")
    print(f"Order lines kept: {summary['lines']}  ({summary['lines'] / max(1, summary['orders']):.2f} per order)")
    print(f"Busiest product: {products[0]['code']} {products[0]['desc']} ({products[0]['picks']} picks)")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)} ({OUT_FILE.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
