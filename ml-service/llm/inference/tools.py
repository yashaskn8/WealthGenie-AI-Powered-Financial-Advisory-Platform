"""
WealthGenie Open-Weight LLM Platform - Financial Tool Calling Engine
Provides built-in financial calculation tools (SIP, CAGR, Tax) with structured execution.
"""

import math
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("wealthgenie.llm.tools")

# ═══════════════════════════════════════════════════════════════════════════
# TAX SLAB DATA — Mirrored from server/services/taxEngine.js L18-L46
# MAINTENANCE: When Union Budget updates slabs, update BOTH this file AND
# server/services/taxEngine.js. Golden vector parity tests in
# tests/test_llm_inference.py will catch any drift immediately.
# ═══════════════════════════════════════════════════════════════════════════
CESS_RATE = 0.04  # 4% Health & Education Cess — FY2025-26

_STANDARD_NEW_SLABS = (
    {"min": 0,       "max": 400_000,       "rate": 0.00},
    {"min": 400_000, "max": 800_000,       "rate": 0.05},
    {"min": 800_000, "max": 1_200_000,     "rate": 0.10},
    {"min": 1_200_000, "max": 1_600_000,   "rate": 0.15},
    {"min": 1_600_000, "max": 2_000_000,   "rate": 0.20},
    {"min": 2_000_000, "max": 2_400_000,   "rate": 0.25},
    {"min": 2_400_000, "max": float("inf"), "rate": 0.30},
)

_STANDARD_OLD_SLABS = (
    {"min": 0,         "max": 250_000,       "rate": 0.00},
    {"min": 250_000,   "max": 500_000,       "rate": 0.05},
    {"min": 500_000,   "max": 1_000_000,     "rate": 0.20},
    {"min": 1_000_000, "max": float("inf"),   "rate": 0.30},
)

TAX_SLABS_BY_FY = {
    "FY2025-26": {"verified": True, "new": _STANDARD_NEW_SLABS, "old": _STANDARD_OLD_SLABS},
    "FY2026-27": {"verified": True, "new": _STANDARD_NEW_SLABS, "old": _STANDARD_OLD_SLABS},
}


def _get_current_fiscal_year() -> str:
    """Dynamically compute India's current fiscal year (April–March)."""
    now = datetime.now()
    start_year = now.year if now.month >= 4 else now.year - 1
    end_year = start_year + 1
    return f"FY{start_year}-{str(end_year)[-2:]}"


CURRENT_FY = _get_current_fiscal_year()


def _get_regime_slabs(regime: str, fiscal_year: str = CURRENT_FY):
    entry = TAX_SLABS_BY_FY.get(fiscal_year, TAX_SLABS_BY_FY.get(CURRENT_FY))
    return entry["old"] if regime == "old" else entry["new"]


def _calculate_from_slabs(taxable_income: float, slabs) -> float:
    """Calculate tax from slab structure — mirrors taxEngine.js calculateFromSlabs()."""
    tax = 0.0
    for slab in slabs:
        if taxable_income <= slab["min"]:
            break
        taxable_in_slab = min(taxable_income, slab["max"]) - slab["min"]
        tax += taxable_in_slab * slab["rate"]
    return tax


def _calculate_taxable_income(
    annual_income: float,
    regime: str = "new",
    deductions: Optional[Dict[str, Any]] = None,
    income_source: str = "salary",
) -> Dict[str, Any]:
    """
    Compute allowed deductions and taxable income.
    Mirrors server/services/taxEngine.js calculateTaxableIncome() L145-197.
    """
    deductions = deductions or {}

    # Standard deduction
    standard_deduction = 0
    if income_source in ("salary", "pension"):
        standard_deduction = 75_000 if regime == "new" else 50_000
    elif income_source == "family_pension":
        standard_deduction = min(annual_income / 3, 15_000)

    # Section 80CCD(2) — Employer NPS Contribution (available under BOTH regimes)
    basic_salary = deductions.get("basic_salary", deductions.get("basicSalary", annual_income * 0.5))
    is_govt_employee = deductions.get("is_govt_employee", deductions.get("isGovtEmployee", False))
    nps_80ccd2_limit_pct = 0.14 if is_govt_employee else 0.10
    max_80ccd2 = basic_salary * nps_80ccd2_limit_pct
    nps_80ccd2 = min(deductions.get("nps_80ccd2", deductions.get("nps80CCD2", 0)), max_80ccd2)

    # Old-regime-only deductions
    section_80c = min(deductions.get("section_80c", deductions.get("section80C", 0)), 150_000)
    nps_80ccd1b = min(
        deductions.get("nps_80ccd1b", deductions.get("nps80CCD1B",
            deductions.get("section_80ccd", deductions.get("section80CCD", 0)))), 50_000)

    # Section 80D — Granular self vs parents
    age = deductions.get("age", 30)
    self_senior = age >= 60 or deductions.get("self_senior", False)
    parents_senior = deductions.get("parents_senior", False)
    max_80d_self = 50_000 if self_senior else 25_000
    max_80d_parents = 50_000 if parents_senior else 25_000

    if "section80D_self" in deductions or "section_80d_self" in deductions or \
       "section80D_parents" in deductions or "section_80d_parents" in deductions:
        allowed_80d_self = min(
            deductions.get("section_80d_self", deductions.get("section80D_self", 0)), max_80d_self)
        allowed_80d_parents = min(
            deductions.get("section_80d_parents", deductions.get("section80D_parents", 0)), max_80d_parents)
        allowed_80d = allowed_80d_self + allowed_80d_parents
    else:
        allowed_80d = min(deductions.get("section_80d", deductions.get("section80D", 0)), 100_000)

    hra = deductions.get("hra", 0)
    home_loan_interest = min(deductions.get("home_loan_interest", deductions.get("homeLoanInterest", 0)), 200_000)
    section_80eea = min(deductions.get("section_80eea", deductions.get("section80EEA", 0)), 150_000)
    other_deductions = deductions.get("other", 0)

    savings_interest = deductions.get("savings_interest", deductions.get("savingsInterest", 0))
    section_80tta = deductions.get("section_80tta", deductions.get("section80TTA", 0))
    section_80ttb = deductions.get("section_80ttb", deductions.get("section80TTB", 0))
    if savings_interest > 0:
        if age >= 60:
            section_80ttb = max(section_80ttb, savings_interest)
        else:
            section_80tta = max(section_80tta, savings_interest)
    allowed_80tta = min(section_80tta, 10_000) if age < 60 else 0
    allowed_80ttb = min(section_80ttb, 50_000) if age >= 60 else 0

    old_regime_deductions = 0.0
    if regime == "old":
        old_regime_deductions = (
            section_80c + nps_80ccd1b + allowed_80d + hra +
            home_loan_interest + section_80eea +
            allowed_80tta + allowed_80ttb + other_deductions
        )

    taxable_income = max(0.0, annual_income - standard_deduction - nps_80ccd2 - old_regime_deductions)
    return {
        "standard_deduction": standard_deduction,
        "old_regime_deductions": old_regime_deductions,
        "taxable_income": taxable_income,
        "nps_80ccd2": nps_80ccd2,
        "allowed_80d": allowed_80d,
    }


def _compute_surcharge(tax_before_surcharge: float, taxable_income: float, regime: str) -> float:
    """Mirrors taxEngine.js computeSurcharge() L78-102."""
    if taxable_income <= 5_000_000:
        return 0.0
    surcharge_rate = 0.0
    if regime == "new":
        if taxable_income <= 10_000_000:
            surcharge_rate = 0.10
        elif taxable_income <= 20_000_000:
            surcharge_rate = 0.15
        else:
            surcharge_rate = 0.25
    else:  # old regime
        if taxable_income <= 10_000_000:
            surcharge_rate = 0.10
        elif taxable_income <= 20_000_000:
            surcharge_rate = 0.15
        elif taxable_income <= 50_000_000:
            surcharge_rate = 0.25
        else:
            surcharge_rate = 0.37
    return tax_before_surcharge * surcharge_rate


def _compute_marginal_relief(
    base_tax: float, surcharge: float, taxable_income: float,
    regime: str, fiscal_year: str = CURRENT_FY,
) -> float:
    """Mirrors taxEngine.js computeMarginalRelief() L106-141."""
    if taxable_income <= 5_000_000:
        return 0.0

    surcharge_thresholds = (
        [5_000_000, 10_000_000, 20_000_000] if regime == "new"
        else [5_000_000, 10_000_000, 20_000_000, 50_000_000]
    )
    threshold = 5_000_000
    for t in surcharge_thresholds:
        if taxable_income > t:
            threshold = t

    slabs = _get_regime_slabs(regime, fiscal_year)
    base_tax_at_threshold = _calculate_from_slabs(threshold, slabs)

    threshold_surcharge_rate = 0.0
    if threshold == 10_000_000:
        threshold_surcharge_rate = 0.10
    elif threshold == 20_000_000:
        threshold_surcharge_rate = 0.15
    elif threshold == 50_000_000 and regime == "old":
        threshold_surcharge_rate = 0.25

    tax_at_threshold = base_tax_at_threshold * (1 + threshold_surcharge_rate)
    total_actual = base_tax + surcharge
    income_gain = taxable_income - threshold
    max_allowed_tax = tax_at_threshold + income_gain
    marginal_relief = total_actual - max_allowed_tax if total_actual > max_allowed_tax else 0.0
    return round(marginal_relief)


class ToolCallResult(BaseModel):
    """Result of a tool invocation."""
    tool_name: str = Field(..., description="Name of invoked tool")
    arguments: Dict[str, Any] = Field(..., description="Arguments passed to tool")
    result: Dict[str, Any] = Field(..., description="Structured computation output")
    success: bool = Field(True, description="Whether tool execution succeeded")


class ToolCallingEngine:
    """Registry and execution engine for LLM financial tool calls."""

    @staticmethod
    def calculate_sip(monthly_investment: float, rate_pct: float, years: int) -> Dict[str, Any]:
        """Calculates Systematic Investment Plan (SIP) future wealth accumulation."""
        i = (rate_pct / 100.0) / 12.0
        n = years * 12
        future_value = monthly_investment * (((1 + i) ** n - 1) / i) * (1 + i)
        total_invested = monthly_investment * n
        wealth_gained = future_value - total_invested
        return {
            "monthly_investment": monthly_investment,
            "annual_return_pct": rate_pct,
            "duration_years": years,
            "total_invested": round(total_invested, 2),
            "estimated_future_value": round(future_value, 2),
            "wealth_gained": round(wealth_gained, 2),
        }

    @staticmethod
    def calculate_cagr(initial_value: float, final_value: float, years: float) -> Dict[str, Any]:
        """Calculates Compound Annual Growth Rate (CAGR)."""
        if initial_value <= 0 or years <= 0:
            raise ValueError("initial_value and years must be positive.")
        cagr = ((final_value / initial_value) ** (1.0 / years) - 1.0) * 100.0
        return {
            "initial_value": initial_value,
            "final_value": final_value,
            "years": years,
            "cagr_percent": round(cagr, 2),
        }

    @staticmethod
    def calculate_tax_rebate(
        taxable_income: float = 0.0,
        regime: str = "new",
        annual_income: Optional[float] = None,
        deductions: Optional[Dict[str, Any]] = None,
        income_source: str = "salary",
        fiscal_year: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Compute full Indian income tax liability with Section 87A rebate,
        surcharge, marginal relief, and 4% Health & Education cess.

        Mirrors server/services/taxEngine.js computeTax() exactly.

        Parameters:
        - taxable_income: Pre-computed net taxable income (used directly if
          annual_income is not provided).
        - regime: 'new' or 'old'.
        - annual_income: Gross annual income. If provided, taxable_income is
          computed from this using standard deduction and deductions.
        - deductions: Optional dict of deduction amounts (section_80c, section_80d,
          hra, home_loan_interest, nps_80ccd1b, nps_80ccd2, etc.)
        - income_source: 'salary', 'pension', 'family_pension', or 'other'.
        - fiscal_year: e.g. 'FY2025-26'. Defaults to current FY.
        """
        regime_clean = regime.lower() if regime else "new"
        if regime_clean not in ("new", "old"):
            regime_clean = "new"
        fy = fiscal_year or CURRENT_FY

        # Determine taxable income
        safe_annual = annual_income
        standard_deduction = 0.0
        old_regime_deductions = 0.0
        nps_80ccd2_applied = 0.0

        if annual_income is not None and annual_income > 0:
            # Compute taxable income from gross using canonical deduction logic
            if not math.isfinite(annual_income) or annual_income < 0:
                safe_annual = 0.0
            ti_result = _calculate_taxable_income(
                safe_annual, regime_clean, deductions, income_source
            )
            effective_taxable = ti_result["taxable_income"]
            standard_deduction = ti_result["standard_deduction"]
            old_regime_deductions = ti_result["old_regime_deductions"]
            nps_80ccd2_applied = ti_result["nps_80ccd2"]
        else:
            # Use raw taxable_income directly (LLM already computed net)
            effective_taxable = max(0.0, taxable_income)
            safe_annual = effective_taxable  # For effective rate computation

        slabs = _get_regime_slabs(regime_clean, fy)
        tax_before_cess = _calculate_from_slabs(effective_taxable, slabs)

        # Section 87A Rebate
        rebate_applied = False
        marginal_relief_applied = False
        marginal_relief_amount_87a = 0.0
        rebate_limit = 1_200_000 if regime_clean == "new" else 500_000

        if effective_taxable <= rebate_limit:
            tax_before_cess = 0.0
            rebate_applied = True
        elif regime_clean == "new":
            # Section 87A Proviso (Section 115BAC marginal relief):
            # Tax shall not exceed excess over rebate limit
            excess_over_limit = effective_taxable - rebate_limit
            if tax_before_cess > excess_over_limit:
                marginal_relief_amount_87a = tax_before_cess - excess_over_limit
                tax_before_cess = excess_over_limit
                marginal_relief_applied = True

        # Surcharge
        surcharge = _compute_surcharge(tax_before_cess, effective_taxable, regime_clean)
        relief = _compute_marginal_relief(
            tax_before_cess, surcharge, effective_taxable, regime_clean, fy
        )
        tax_after_surcharge = tax_before_cess + surcharge - relief

        # 4% Health & Education Cess
        cess = tax_after_surcharge * CESS_RATE
        tax_amount = tax_after_surcharge + cess

        effective_rate = 0.0
        if safe_annual and safe_annual > 0:
            effective_rate = round((tax_amount / safe_annual) * 100, 2)

        return {
            "taxable_income": effective_taxable,
            "regime": regime_clean,
            "tax_before_cess": round(tax_before_cess),
            "section_87a_rebate": round(marginal_relief_amount_87a) if marginal_relief_applied else (
                round(_calculate_from_slabs(effective_taxable, slabs)) if rebate_applied else 0
            ),
            "rebate_applied": rebate_applied,
            "marginal_relief_applied": marginal_relief_applied or relief > 0,
            "marginal_relief_amount": round(relief + marginal_relief_amount_87a),
            "surcharge_applied": surcharge > 0,
            "surcharge_amount": round(surcharge),
            "cess": round(cess),
            "net_tax_liability": round(tax_amount),
            "effective_rate": effective_rate,
            "standard_deduction": standard_deduction,
            "old_regime_deductions": old_regime_deductions,
            "nps_80ccd2": nps_80ccd2_applied,
            "fiscal_year": fy,
        }

    def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolCallResult:
        """Executes named tool with dictionary arguments."""
        try:
            if tool_name == "calculate_sip":
                res = self.calculate_sip(**arguments)
            elif tool_name == "calculate_cagr":
                res = self.calculate_cagr(**arguments)
            elif tool_name == "calculate_tax_rebate":
                res = self.calculate_tax_rebate(**arguments)
            else:
                raise ValueError(f"Unknown tool name: '{tool_name}'")

            return ToolCallResult(tool_name=tool_name, arguments=arguments, result=res, success=True)
        except Exception as e:
            logger.error(f"Tool execution failed for '{tool_name}': {e}")
            return ToolCallResult(
                tool_name=tool_name,
                arguments=arguments,
                result={"error": str(e)},
                success=False,
            )

    def list_tools(self) -> List[Dict[str, Any]]:
        """Returns schemas for registered tools."""
        return [
            {
                "name": "calculate_sip",
                "description": "Calculates future SIP wealth accumulation",
                "parameters": ["monthly_investment", "rate_pct", "years"],
            },
            {
                "name": "calculate_cagr",
                "description": "Calculates compound annual growth rate",
                "parameters": ["initial_value", "final_value", "years"],
            },
            {
                "name": "calculate_tax_rebate",
                "description": (
                    "Computes full Indian income tax liability including Section 87A rebate, "
                    "surcharge with marginal relief, and 4% cess. Accepts either raw "
                    "taxable_income or annual_income with optional deductions dict."
                ),
                "parameters": [
                    "taxable_income", "regime", "annual_income",
                    "deductions", "income_source", "fiscal_year",
                ],
            },
        ]
