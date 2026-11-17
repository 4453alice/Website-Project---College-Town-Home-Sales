"""Build the compact data file the Campus Gravity dashboard loads.

Reads:  data/college_town_home_sales.csv   (never modified)
Writes: data/derived/site_points.json      (one entry per sale kept, plus metadata)

Run from the repository root:  python scripts/build_site_data.py

Cleaning rules (they are also stated on the website):
  1. Price: keep sales from $10,000 to $5,000,000. Below that are non-market transfers or
     errors; above that are a handful of extreme outliers (up to $81.5M) that distort a
     college-town picture. See "Some prices are impossible" in docs/data_description_sheet.md.
  2. Price per sq ft: only computed when living_area_sqft is between 200 and 20,000.
     127 rows have 0 sq ft, and a few report impossible sizes.
  3. Days on market: contract_date minus list_date, only when both dates exist. A blank is
     not zero, and sale_date minus list_date is NOT days on market.
  4. Rows are keyed by listing_id. Nothing is deduplicated by address.
  5. home_type is not used, because it is unreliable.

Campus centers: the dataset gives miles_to_campus for every row but not the landmark's
coordinates. The script recovers each landmark's position by least squares: it finds the
point whose straight-line distance to every sale best matches that sale's miles_to_campus.
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "college_town_home_sales.csv"
OUT_DIR = ROOT / "data" / "derived"
OUT = OUT_DIR / "site_points.json"

PRICE_MIN, PRICE_MAX = 10_000, 5_000_000
SQFT_MIN, SQFT_MAX = 200, 20_000

SHORT_NAMES = {
    "University of Illinois Urbana-Champaign": "Illinois",
    "Purdue University": "Purdue",
    "The University of Iowa": "Iowa",
    "University of Florida": "Florida",
    "University of Georgia": "Georgia",
    "The Pennsylvania State University": "Penn State",
    "University of Wisconsin-Madison": "Wisconsin",
    "University of Michigan": "Michigan",
    "University of Virginia": "Virginia",
    "The University of North Carolina at Chapel Hill": "UNC",
    "University of California, Davis": "UC Davis",
}

EARTH_MILES = 3958.8


def haversine_miles(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * EARTH_MILES * np.arcsin(np.sqrt(a))


def fit_center(group):
    lat, lon, miles = group.latitude.values, group.longitude.values, group.miles_to_campus.values
    start = [lat[miles.argmin()], lon[miles.argmin()]]
    res = least_squares(lambda c: haversine_miles(lat, lon, c[0], c[1]) - miles, start)
    resid = haversine_miles(lat, lon, res.x[0], res.x[1]) - miles
    return float(res.x[0]), float(res.x[1]), float(np.abs(resid).max())


def main():
    df = pd.read_csv(SRC, dtype={"zipcode": str, "county_fips": str, "parcel_number": str})
    total_rows = len(df)

    # Campus centers are fitted on every row, before any price filter.
    universities = sorted(df.university.unique(), key=lambda u: SHORT_NAMES[u])
    campuses = []
    for u in universities:
        lat, lon, max_err = fit_center(df[df.university == u])
        campuses.append({"name": u, "short": SHORT_NAMES[u],
                         "lat": round(lat, 5), "lon": round(lon, 5),
                         "fit_max_error_miles": round(max_err, 3)})
    u_index = {u: i for i, u in enumerate(universities)}

    keep = df[(df.sale_price >= PRICE_MIN) & (df.sale_price <= PRICE_MAX)].copy()
    dropped_low = int((df.sale_price < PRICE_MIN).sum())
    dropped_high = int((df.sale_price > PRICE_MAX).sum())

    sqft_ok = keep.living_area_sqft.between(SQFT_MIN, SQFT_MAX)
    keep["sqft"] = keep.living_area_sqft.where(sqft_ok)
    keep["dom"] = (pd.to_datetime(keep.contract_date) - pd.to_datetime(keep.list_date)).dt.days

    cities = sorted((keep.city + ", " + keep.state).unique())
    c_index = {c: i for i, c in enumerate(cities)}

    def num(v, digits=None):
        if pd.isna(v):
            return None
        return round(float(v), digits) if digits else int(v)

    rows = []
    for r in keep.itertuples(index=False):
        rows.append([
            round(r.latitude, 5), round(r.longitude, 5),
            int(r.sale_price), num(r.sqft), num(r.beds), num(r.baths, 1),
            num(r.year_built), num(r.dom), round(r.miles_to_campus, 2),
            u_index[r.university], c_index[f"{r.city}, {r.state}"],
            r.sale_date if isinstance(r.sale_date, str) else None,
        ])

    out = {
        "source": "College-town home sales dataset, version 1.0 (2026). University of "
                  "Illinois-Deloitte Foundation Center for Business Emerging Technologies.",
        "columns": ["lat", "lon", "price", "sqft", "beds", "baths", "year_built",
                    "days_on_market", "miles_to_campus", "campus", "city", "sale_date"],
        "rules": {
            "price_min": PRICE_MIN, "price_max": PRICE_MAX,
            "sqft_min": SQFT_MIN, "sqft_max": SQFT_MAX,
            "total_rows": total_rows, "kept_rows": len(rows),
            "dropped_below_min": dropped_low, "dropped_above_max": dropped_high,
            "rows_with_price_per_sqft": int(sqft_ok.sum()),
            "rows_with_days_on_market": int(keep.dom.notna().sum()),
            "sale_date_min": keep.sale_date.min(), "sale_date_max": keep.sale_date.max(),
        },
        "campuses": campuses,
        "cities": cities,
        "rows": rows,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(rows):,} rows, {OUT.stat().st_size/1e6:.2f} MB")
    print(json.dumps(out["rules"], indent=2))
    for c in campuses:
        print(c)


if __name__ == "__main__":
    main()
