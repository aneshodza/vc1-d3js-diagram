# SNB balance sheet – d3.js visualisation

## Aufgabe 1: Konzeption
What does the Swiss National Bank hold, and how did that change around the end of the
CHF 1.20 floor (January 2015) and the interest rate turnaround (June 2022)?

- **Sankey (d3-sankey):** liabilities → SNB → assets → foreign currency investments by currency.
  A balance sheet does not say which liability funds which asset, so all liabilities flow into
  one "SNB" node and out again into the assets.
- Node heights use **one scale across all dates**, so the growth of the balance sheet
  (CHF 72 bn in 1997, over CHF 1,000 bn in 2021) is visible, not just the composition.

## Aufgabe 2: Daten
Source: [data.snb.ch](https://data.snb.ch) API, no key needed.

| Cube | Content | Frequency |
|---|---|---|
| `snbbipo` | SNB balance sheet items (CHF millions) | monthly, 1996– |
| `snbcurrc` | Currency breakdown of foreign exchange reserves | quarterly, 1997– |

`prepare.py` downloads both cubes (raw copies in `data/raw/`) and writes `data/snb.json`:
skips the 3-line CSV header, reshapes long format (date;code;value) into one record per month,
treats empty values as 0, groups the 26 items into 9 liabilities and 7 assets, attaches the
currency shares of the matching quarter, and checks that assets and liabilities add up to the total.

```
python3 prepare.py            # fresh download
python3 prepare.py --offline  # rebuild from data/raw/
```

## Aufgabe 3 + 4: Visualisierung und Interaktivität
```
python3 -m http.server 8000   # then open http://localhost:8000
```
(A local server is needed because the browser blocks `d3.json` on `file://`.)

- Animated time series (Play button, 1997–today) and time slider
- Tooltips on nodes and links (value, share, value 12 months earlier, currency shares)
- Hovering a node highlights its flows
- Table view of the current month
- `?date=2014-12` in the URL opens a specific month
- Light and dark mode
