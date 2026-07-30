"""
WealthGenie Open-Weight LLM Platform - Financial Tool Calling Engine
Provides built-in financial calculation tools (SIP, CAGR, Tax Rebate) with structured execution.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("wealthgenie.llm.tools")


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
    def calculate_tax_rebate(taxable_income: float, regime: str = "new") -> Dict[str, Any]:
        """Calculates Section 87A rebate and tax liability under Indian tax rules."""
        regime_clean = regime.lower()
        rebate_amount = 0.0
        tax_before_rebate = 0.0

        if regime_clean == "new":
            if taxable_income <= 700000:
                tax_before_rebate = max(0.0, (taxable_income - 300000) * 0.05) if taxable_income > 300000 else 0.0
                rebate_amount = min(25000.0, tax_before_rebate)
        else:
            if taxable_income <= 500000:
                tax_before_rebate = max(0.0, (taxable_income - 250000) * 0.05) if taxable_income > 250000 else 0.0
                rebate_amount = min(12500.0, tax_before_rebate)

        final_tax = max(0.0, tax_before_rebate - rebate_amount)
        return {
            "taxable_income": taxable_income,
            "regime": regime_clean,
            "tax_before_rebate": round(tax_before_rebate, 2),
            "section_87a_rebate": round(rebate_amount, 2),
            "net_tax_liability": round(final_tax, 2),
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
                "description": "Calculates Section 87A tax rebate liability",
                "parameters": ["taxable_income", "regime"],
            },
        ]
