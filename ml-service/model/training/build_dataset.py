"""Build auditable market-performance records from public AMFI NAV history.

This module produces instrument-performance observations, not investor-to-
instrument recommendation labels. A NAV series documents realised instrument
returns; it does not document which instrument was correct for an investor.

The earlier training pipeline generated profiles and labels from hand-written
rules. That self-referential code has been removed. Do not use these metrics to
fabricate profile labels.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MASTER_PATH = REPOSITORY_ROOT / "shared" / "investment_master.json"
DATA_DIR = REPOSITORY_ROOT / "ml-service" / "data"
PERFORMANCE_CSV_PATH = DATA_DIR / "market_performance.csv"
COVERAGE_PATH = DATA_DIR / "market_performance_coverage.json"

# TigZig exposes public AMFI NAV history without authentication. Scheme codes
# and returned names are verified so every record remains independently auditable.
AMFI_DERIVED_NAV_API = "https://api.tigzig.com/mf/v1/nav"
SOURCE_NAME = "AMFI public NAV history via TigZig open data API"
TRADING_DAYS_PER_YEAR = 252
MIN_RETURN_OBSERVATIONS = TRADING_DAYS_PER_YEAR * 3


@dataclass(frozen=True)
class AmfiScheme:
    instrument_id: str
    scheme_code: int
    expected_scheme_name: str


# Only exact catalogue-to-scheme matches are included. Generic category entries
# are excluded instead of silently substituting a representative fund.
AMFI_SCHEMES = (
    AmfiScheme("parag_parikh_flexi", 122639, "Parag Parikh Flexi Cap Fund - Direct Plan - Growth"),
    AmfiScheme("sbi_bluechip", 119721, "SBI LARGE & MIDCAP FUND -DIRECT PLAN -Growth"),
    AmfiScheme("hdfc_midcap", 118989, "HDFC Mid Cap Fund - Growth Option - Direct Plan"),
    AmfiScheme("mirae_elss", 135781, "Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth"),
    AmfiScheme("index_mf", 119069, "Nippon India Index Fund - Nifty 50 Plan - Direct Plan - Growth Option"),
    AmfiScheme("liquid_mf", 118749, "ICICI Prudential Liquid Fund - Direct Plan - Growth"),
)


class MarketDataError(RuntimeError):
    """Raised when a real market-data record cannot be retrieved or validated."""


def _load_catalogue() -> list[dict[str, Any]]:
    with MASTER_PATH.open(encoding="utf-8") as source:
        return json.load(source)["instruments"]


def _fetch_nav_history(scheme: AmfiScheme, since: date) -> dict[str, Any]:
    query = urlencode({"scheme": scheme.scheme_code, "since": since.isoformat()})
    request = Request(
        f"{AMFI_DERIVED_NAV_API}?{query}",
        headers={"User-Agent": "WealthGenie-market-data-builder/1.0"},
    )
    try:
        with urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except Exception as error:
        raise MarketDataError(
            f"Could not retrieve AMFI NAV history for {scheme.instrument_id} "
            f"(scheme {scheme.scheme_code}): {error}"
        ) from error

    if payload.get("scheme_code") != scheme.scheme_code:
        raise MarketDataError(
            f"AMFI scheme-code mismatch for {scheme.instrument_id}: "
            f"expected {scheme.scheme_code}, received {payload.get('scheme_code')}"
        )
    if payload.get("scheme_name") != scheme.expected_scheme_name:
        raise MarketDataError(
            f"AMFI scheme-name mismatch for {scheme.instrument_id}: "
            f"expected {scheme.expected_scheme_name!r}, received {payload.get('scheme_name')!r}"
        )
    if not payload.get("data"):
        raise MarketDataError(f"AMFI returned no NAV observations for {scheme.instrument_id}")
    return payload


def _metric_from_nav_history(history: list[dict[str, Any]]) -> dict[str, float | str | int]:
    ordered = sorted(history, key=lambda point: point["date"])
    dates = [date.fromisoformat(point["date"]) for point in ordered]
    nav = np.asarray([float(point["nav"]) for point in ordered], dtype=float)
    if np.any(nav <= 0) or not np.all(np.isfinite(nav)):
        raise MarketDataError("NAV history contains a non-positive or non-finite value")

    daily_returns = np.diff(nav) / nav[:-1]
    if len(daily_returns) < MIN_RETURN_OBSERVATIONS:
        raise MarketDataError(
            f"Only {len(daily_returns)} daily returns are available; "
            f"at least {MIN_RETURN_OBSERVATIONS} are required for a three-year metric"
        )
    downside_deviation = math.sqrt(float(np.mean(np.square(np.minimum(daily_returns, 0.0)))))
    if downside_deviation == 0.0:
        raise MarketDataError("Downside deviation is zero; Sortino ratio is undefined")

    return {
        "observation_count": len(ordered),
        "return_observation_count": len(daily_returns),
        "start_date": dates[0].isoformat(),
        "end_date": dates[-1].isoformat(),
        "annualised_return": float(np.prod(1.0 + daily_returns) ** (TRADING_DAYS_PER_YEAR / len(daily_returns)) - 1.0),
        "annualised_volatility": float(np.std(daily_returns, ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR)),
        "three_year_sortino": float(np.mean(daily_returns) / downside_deviation * math.sqrt(TRADING_DAYS_PER_YEAR)),
    }


def _write_artifacts(records: list[dict[str, Any]], coverage: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fields = [
        "instrument_id", "catalogue_name", "category", "asset_class", "amfi_scheme_code",
        "amfi_scheme_name", "source", "start_date", "end_date", "observation_count",
        "return_observation_count", "annualised_return", "annualised_volatility", "three_year_sortino",
    ]
    with PERFORMANCE_CSV_PATH.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    with COVERAGE_PATH.open("w", encoding="utf-8") as destination:
        json.dump(coverage, destination, indent=2)


def build_market_performance_dataset() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch real NAV histories and return one auditable record per covered instrument."""
    catalogue = _load_catalogue()
    catalogue_by_id = {instrument["id"]: instrument for instrument in catalogue}
    configured_ids = {scheme.instrument_id for scheme in AMFI_SCHEMES}
    unknown_ids = configured_ids - set(catalogue_by_id)
    if unknown_ids:
        raise MarketDataError(f"Configured IDs absent from investment_master.json: {sorted(unknown_ids)}")

    requested_since = date.today() - timedelta(days=365 * 4)
    records: list[dict[str, Any]] = []
    retrieval_failures: dict[str, str] = {}
    for scheme in AMFI_SCHEMES:
        try:
            payload = _fetch_nav_history(scheme, requested_since)
            metrics = _metric_from_nav_history(payload["data"])
        except MarketDataError as error:
            retrieval_failures[scheme.instrument_id] = str(error)
            continue
        instrument = catalogue_by_id[scheme.instrument_id]
        records.append({
            "instrument_id": scheme.instrument_id,
            "catalogue_name": instrument["name"],
            "category": instrument["category"],
            "asset_class": instrument["assetClass"],
            "amfi_scheme_code": scheme.scheme_code,
            "amfi_scheme_name": payload["scheme_name"],
            "source": SOURCE_NAME,
            **metrics,
        })

    covered_ids = [record["instrument_id"] for record in records]
    excluded = []
    for instrument in catalogue:
        instrument_id = instrument["id"]
        if instrument_id in covered_ids:
            continue
        reason = retrieval_failures.get(
            instrument_id,
            "No exact, auditable daily NAV or price-series identifier is configured for this catalogue entry",
        )
        excluded.append({"instrument_id": instrument_id, "reason": reason})

    coverage = {
        "source": SOURCE_NAME,
        "metric": "Annualised trailing Sortino ratio from daily NAV returns, minimum three years",
        "requested_since": requested_since.isoformat(),
        "catalogue_instrument_count": len(catalogue),
        "covered_instrument_count": len(records),
        "excluded_instrument_count": len(excluded),
        "covered_instrument_ids": covered_ids,
        "excluded_instruments": excluded,
        "retrieval_failures": retrieval_failures,
        "important_limitation": (
            "These are real instrument-performance outcomes, not observed investor-to-instrument "
            "recommendation outcomes. They must not be used as labels for the investor-profile classifier."
        ),
    }
    _write_artifacts(records, coverage)
    return records, coverage


def print_market_data_summary(records: list[dict[str, Any]], coverage: dict[str, Any]) -> None:
    print(f"Market data source: {coverage['source']}")
    print(f"Metric: {coverage['metric']}")
    print(
        "Instrument coverage: "
        f"{coverage['covered_instrument_count']} covered / {coverage['excluded_instrument_count']} excluded / "
        f"{coverage['catalogue_instrument_count']} total"
    )
    print(f"Included IDs ({len(coverage['covered_instrument_ids'])}): {', '.join(coverage['covered_instrument_ids'])}")
    print(
        f"Excluded IDs ({len(coverage['excluded_instruments'])}): "
        + ", ".join(item["instrument_id"] for item in coverage["excluded_instruments"])
    )
    if records:
        print(f"Dataset row count: {len(records)}")
        print(
            "Data date range: "
            f"{min(record['start_date'] for record in records)} to {max(record['end_date'] for record in records)}"
        )
        print("Trailing Sortino ratios:")
        for record in records:
            print(f"  {record['instrument_id']}: {record['three_year_sortino']:.4f} ({record['start_date']} to {record['end_date']})")
    print(f"Performance data: {PERFORMANCE_CSV_PATH}")
    print(f"Coverage report: {COVERAGE_PATH}")


if __name__ == "__main__":
    dataset_records, dataset_coverage = build_market_performance_dataset()
    print_market_data_summary(dataset_records, dataset_coverage)