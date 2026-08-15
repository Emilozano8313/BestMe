"""
BestMe — Metabolic Engine Service
====================================
Pure-function service for calculating BMR, TDEE, calorie targets,
and dynamic macro splits based on user anthropometric data and goals.

Equations:
  - Mifflin-St Jeor (default): (10 × weight_kg) + (6.25 × height_cm) − (5 × age) + s
  - Katch-McArdle (when body_fat_percentage is available): 370 + (21.6 × lean_mass_kg)

Rule: If body_fat_percentage is not None → Katch-McArdle takes precedence.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


# ── Result Data Classes ──────────────────────────────────────────

class EquationUsed(str, Enum):
    MIFFLIN_ST_JEOR = "mifflin_st_jeor"
    KATCH_MCARDLE = "katch_mcardle"


@dataclass(frozen=True)
class BMRResult:
    """Result of BMR calculation with metadata."""
    value: float
    equation_used: EquationUsed
    lean_mass_kg: Optional[float] = None


@dataclass(frozen=True)
class MacroSplit:
    """Macronutrient distribution in grams and kilocalories."""
    protein_g: float
    carbs_g: float
    fat_g: float
    protein_kcal: float
    carbs_kcal: float
    fat_kcal: float


@dataclass(frozen=True)
class MetabolicSnapshot:
    """Complete metabolic profile for a user."""
    bmr: float
    equation_used: EquationUsed
    lean_mass_kg: Optional[float]
    tdee: float
    calorie_target: float
    macros: MacroSplit
    activity_level: str
    goal: str


# ── Activity Level Multipliers ───────────────────────────────────

ACTIVITY_MULTIPLIERS: dict[str, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# ── Calorie Adjustments by Goal ──────────────────────────────────

CALORIE_ADJUSTMENTS: dict[str, float] = {
    "lose_weight": -500,
    "maintain": 0,
    "gain_muscle": +350,
}

# ── Protein per kg by Goal ───────────────────────────────────────
# Higher protein in deficit to maximize muscle retention.

PROTEIN_PER_KG: dict[str, float] = {
    "lose_weight": 2.2,
    "maintain": 1.8,
    "gain_muscle": 2.0,
}

# ── Fat percentage of calories by Goal ───────────────────────────

FAT_CALORIE_PERCENT: dict[str, float] = {
    "lose_weight": 0.25,
    "maintain": 0.28,
    "gain_muscle": 0.25,
}

# ── Caloric density constants ────────────────────────────────────

KCAL_PER_G_PROTEIN = 4.0
KCAL_PER_G_CARBS = 4.0
KCAL_PER_G_FAT = 9.0


# ── Metabolic Engine ─────────────────────────────────────────────

class MetabolicEngine:
    """
    Stateless service that encapsulates all metabolic calculations.

    All methods are class-level or static — no instance state is needed.
    This makes the engine easy to test and reuse across different contexts.
    """

    @staticmethod
    def calculate_age(date_of_birth: date) -> int:
        """
        Calculate age in completed years from date of birth.

        Uses today's date as reference. Accounts for cases where the
        birthday has not yet occurred in the current year.
        """
        today = date.today()
        age = today.year - date_of_birth.year

        # Subtract 1 if birthday hasn't occurred yet this year
        if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
            age -= 1

        return age

    @staticmethod
    def calculate_bmr(
        weight_kg: float,
        height_cm: float,
        age: int,
        gender: str,
        body_fat_percentage: Optional[float] = None,
    ) -> BMRResult:
        """
        Calculate Basal Metabolic Rate (BMR).

        Decision rule:
          - If body_fat_percentage is provided and not None →
            use Katch-McArdle based on lean body mass.
          - Otherwise → use Mifflin-St Jeor.

        Args:
            weight_kg: User's body weight in kilograms.
            height_cm: User's height in centimeters.
            age: User's age in years.
            gender: "male", "female", or "other" (treated as average of male/female).
            body_fat_percentage: Optional body fat % (0-100). If provided,
                                 Katch-McArdle is used instead.

        Returns:
            BMRResult with value, equation used, and lean mass if applicable.
        """
        if body_fat_percentage is not None:
            # ── Katch-McArdle ────────────────────────────────
            lean_mass_kg = weight_kg * (1 - body_fat_percentage / 100.0)
            bmr = 370 + (21.6 * lean_mass_kg)
            return BMRResult(
                value=round(bmr, 1),
                equation_used=EquationUsed.KATCH_MCARDLE,
                lean_mass_kg=round(lean_mass_kg, 2),
            )

        # ── Mifflin-St Jeor ─────────────────────────────────
        base = (10 * weight_kg) + (6.25 * height_cm) - (5 * age)

        if gender == "male":
            bmr = base + 5
        elif gender == "female":
            bmr = base - 161
        else:
            # "other" or unspecified → average of male and female adjustments
            bmr = base + ((5 + (-161)) / 2)  # = base - 78

        return BMRResult(
            value=round(bmr, 1),
            equation_used=EquationUsed.MIFFLIN_ST_JEOR,
            lean_mass_kg=None,
        )

    @staticmethod
    def calculate_tdee(bmr: float, activity_level: str) -> float:
        """
        Calculate Total Daily Energy Expenditure.

        TDEE = BMR × activity multiplier.

        Args:
            bmr: Basal Metabolic Rate in kcal/day.
            activity_level: One of: sedentary, light, moderate, active, very_active.

        Returns:
            TDEE in kcal/day, rounded to 1 decimal.
        """
        multiplier = ACTIVITY_MULTIPLIERS.get(activity_level, 1.55)
        return round(bmr * multiplier, 1)

    @staticmethod
    def calculate_calorie_target(tdee: float, goal: str) -> float:
        """
        Calculate daily calorie target based on fitness goal.

        Args:
            tdee: Total Daily Energy Expenditure.
            goal: One of: lose_weight, maintain, gain_muscle.

        Returns:
            Calorie target in kcal/day, rounded to nearest integer.
        """
        adjustment = CALORIE_ADJUSTMENTS.get(goal, 0)
        return round(tdee + adjustment)

    @staticmethod
    def calculate_macros(
        calorie_target: float,
        weight_kg: float,
        goal: str,
    ) -> MacroSplit:
        """
        Calculate dynamic macronutrient split based on goal.

        Strategy:
          1. Protein → fixed g/kg based on goal (high in deficit for muscle retention).
          2. Fat → fixed % of total calories based on goal.
          3. Carbs → remaining calories.

        Args:
            calorie_target: Daily calorie target in kcal.
            weight_kg: User's body weight in kg.
            goal: Fitness goal string.

        Returns:
            MacroSplit with grams and kcal for each macronutrient.
        """
        # 1. Protein
        protein_per_kg = PROTEIN_PER_KG.get(goal, 1.8)
        protein_g = round(weight_kg * protein_per_kg, 1)
        protein_kcal = round(protein_g * KCAL_PER_G_PROTEIN, 1)

        # 2. Fat
        fat_pct = FAT_CALORIE_PERCENT.get(goal, 0.28)
        fat_kcal = round(calorie_target * fat_pct, 1)
        fat_g = round(fat_kcal / KCAL_PER_G_FAT, 1)

        # 3. Carbs = remaining calories
        carbs_kcal = round(calorie_target - protein_kcal - fat_kcal, 1)
        carbs_kcal = max(carbs_kcal, 0)  # Safety: never go negative
        carbs_g = round(carbs_kcal / KCAL_PER_G_CARBS, 1)

        return MacroSplit(
            protein_g=protein_g,
            carbs_g=carbs_g,
            fat_g=fat_g,
            protein_kcal=protein_kcal,
            carbs_kcal=carbs_kcal,
            fat_kcal=fat_kcal,
        )

    @classmethod
    def compute_full_profile(
        cls,
        weight_kg: float,
        height_cm: float,
        date_of_birth: date,
        gender: str,
        activity_level: str,
        goal: str,
        body_fat_percentage: Optional[float] = None,
    ) -> MetabolicSnapshot:
        """
        Compute the complete metabolic profile in one call.

        This is the high-level orchestrator that chains all calculations:
        BMR → TDEE → calorie target → macro split.

        Args:
            weight_kg: Body weight in kg.
            height_cm: Height in cm.
            date_of_birth: Date of birth for age calculation.
            gender: "male", "female", or "other".
            activity_level: Activity level string.
            goal: Fitness goal string.
            body_fat_percentage: Optional body fat percentage.

        Returns:
            MetabolicSnapshot with all computed values.
        """
        age = cls.calculate_age(date_of_birth)

        bmr_result = cls.calculate_bmr(
            weight_kg=weight_kg,
            height_cm=height_cm,
            age=age,
            gender=gender,
            body_fat_percentage=body_fat_percentage,
        )

        tdee = cls.calculate_tdee(bmr_result.value, activity_level)
        calorie_target = cls.calculate_calorie_target(tdee, goal)
        macros = cls.calculate_macros(calorie_target, weight_kg, goal)

        return MetabolicSnapshot(
            bmr=bmr_result.value,
            equation_used=bmr_result.equation_used,
            lean_mass_kg=bmr_result.lean_mass_kg,
            tdee=tdee,
            calorie_target=calorie_target,
            macros=macros,
            activity_level=activity_level,
            goal=goal,
        )
