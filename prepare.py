import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "data" / "raw"
OUT = Path(__file__).parent / "data" / "snb.json"
API = "https://data.snb.ch/api/cube/{}/data/csv/en"

LIABILITIES = {
    "Banknotes in circulation": ["N"],
    "Sight deposits of domestic banks": ["GB"],
    "Due to the Confederation": ["VB"],
    "Other sight liabilities": ["GBI", "US"],
    "CHF repo liabilities": ["VRGSF"],
    "SNB debt certificates": ["ES"],
    "Foreign currency liabilities": ["VF"],
    "Other liabilities": ["UT", "AIWFS", "SP"],
    "Provisions and equity": ["RE"],
}
ASSETS = {
    "Gold": ["GFG"],
    "Foreign currency investments": ["D"],
    "CHF securities": ["WSF"],
    "Repo and money market claims": ["FRGSF", "FRGUSD", "GSGSF", "IG", "GD", "FI"],
    "IMF and international": ["RIWF", "IZ", "W"],
    "Stabilisation fund (UBS)": ["DS"],
    "Other assets": ["UA"],
}
CURRENCIES = ["USD", "EUR", "JPY", "GBP", "CAD", "Other"]


def load(cube):
    path = RAW / f"{cube}.csv"
    if "--offline" not in sys.argv:
        with urllib.request.urlopen(API.format(cube), timeout=60) as r:
            path.write_bytes(r.read())
    text = path.read_text(encoding="utf-8-sig").splitlines()
    rows = csv.DictReader(io.StringIO("\n".join(text[3:])), delimiter=";")
    return {(r["Date"], r["D0"]): float(r["Value"] or 0) for r in rows}


def quarter_of(month):
    y, m = month.split("-")
    return f"{y}-Q{(int(m) - 1) // 3 + 1}"


def main():
    bs = load("snbbipo")
    cur = load("snbcurrc")
    quarters = sorted({d for d, _ in cur})

    months = []
    for date in sorted({d for d, _ in bs}):
        q = max((x for x in quarters if x <= quarter_of(date)), default=None)
        if q is None:
            continue
        total_fx = cur[(q, "ICHF6")]
        shares = {c: cur.get((q, f"ICHF{i}"), 0) / total_fx for i, c in enumerate(CURRENCIES)}

        def grouped(groups):
            return {name: round(sum(bs.get((date, c), 0) for c in codes), 1)
                    for name, codes in groups.items()}

        months.append({
            "date": date,
            "total": round(bs[(date, "T0")], 1),
            "liabilities": grouped(LIABILITIES),
            "assets": grouped(ASSETS),
            "currencyQuarter": q,
            "currencyShares": {c: round(s, 4) for c, s in shares.items()},
        })

    for m in months:
        for side in ("assets", "liabilities"):
            diff = abs(sum(m[side].values()) - m["total"])
            assert diff < m["total"] * 1e-4, f"{m['date']} {side} off by {diff}"

    OUT.write_text(json.dumps({
        "unit": "CHF millions",
        "source": "Swiss National Bank, data.snb.ch (cubes snbbipo, snbcurrc)",
        "liabilityNames": list(LIABILITIES),
        "assetNames": list(ASSETS),
        "currencies": CURRENCIES,
        "months": months,
    }, indent=1))
    print(f"wrote {OUT} with {len(months)} months ({months[0]['date']} to {months[-1]['date']})")


if __name__ == "__main__":
    main()
