"""
BestMe — Metabolic Engine Tests
=================================
Unit tests for the MetabolicEngine service.
Tests both Mifflin-St Jeor and Katch-McArdle equations with known values,
edge cases, and the full profile orchestrator.
"""

import pytest
from datetime import date
from unittest.mock import patch

from app.services.metabolic import (
    MetabolicEngine,
    EquationUsed,
    BMRResult,
    MacroSplit,
    MetabolicSnapshot,
)


# ═══════════════════════════════════════════════════════════════════
# Age Calculation
# ═══════════════════════════════════════════════════════════════════

class TestCalculateAge:
    def test_age_birthday_already_passed(self):
        """Age when birthday already occurred this year."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 8, 14)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
            age = MetabolicEngine.calculate_age(date(1995, 6, 15))
            assert age == 31

    def test_age_birthday_not_yet(self):
        """Age when birthday hasn't occurred yet this year."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 3, 10)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
            age = MetabolicEngine.calculate_age(date(1995, 6, 15))
            assert age == 30

    def test_age_on_birthday(self):
        """Age on the exact birthday."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 6, 15)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
            age = MetabolicEngine.calculate_age(date(1995, 6, 15))
            assert age == 31


# ═══════════════════════════════════════════════════════════════════
# BMR Calculation — Mifflin-St Jeor (default)
# ═══════════════════════════════════════════════════════════════════

class TestBMRMifflinStJeor:
    """
    Mifflin-St Jeor formula:
      Male:   BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5
      Female: BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161
    """

    def test_male_standard(self):
        """Standard male: 80kg, 178cm, 30 years old."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="male"
        )
        # (10*80) + (6.25*178) - (5*30) + 5 = 800 + 1112.5 - 150 + 5 = 1767.5
        assert result.equation_used == EquationUsed.MIFFLIN_ST_JEOR
        assert result.value == 1767.5
        assert result.lean_mass_kg is None

    def test_female_standard(self):
        """Standard female: 65kg, 165cm, 28 years old."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=65, height_cm=165, age=28, gender="female"
        )
        # (10*65) + (6.25*165) - (5*28) - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
        assert result.equation_used == EquationUsed.MIFFLIN_ST_JEOR
        assert result.value == 1380.2  # rounded to 1 decimal
        assert result.lean_mass_kg is None

    def test_other_gender_averages(self):
        """'other' gender uses average of male (+5) and female (-161) = -78."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=75, height_cm=170, age=25, gender="other"
        )
        # base = (10*75) + (6.25*170) - (5*25) = 750 + 1062.5 - 125 = 1687.5
        # adjustment = (5 + (-161)) / 2 = -78
        # BMR = 1687.5 - 78 = 1609.5
        assert result.equation_used == EquationUsed.MIFFLIN_ST_JEOR
        assert result.value == 1609.5

    def test_no_body_fat_uses_mifflin(self):
        """Explicitly passing body_fat_percentage=None uses Mifflin-St Jeor."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="male",
            body_fat_percentage=None,
        )
        assert result.equation_used == EquationUsed.MIFFLIN_ST_JEOR


# ═══════════════════════════════════════════════════════════════════
# BMR Calculation — Katch-McArdle (when body_fat_percentage provided)
# ═══════════════════════════════════════════════════════════════════

class TestBMRKatchMcArdle:
    """
    Katch-McArdle formula:
      BMR = 370 + (21.6 × lean_mass_kg)
      lean_mass_kg = weight × (1 - body_fat_percentage / 100)
    """

    def test_with_body_fat_standard(self):
        """80kg at 18% body fat."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="male",
            body_fat_percentage=18.0,
        )
        # lean_mass = 80 * (1 - 0.18) = 80 * 0.82 = 65.6
        # BMR = 370 + (21.6 * 65.6) = 370 + 1416.96 = 1786.96 → 1787.0
        assert result.equation_used == EquationUsed.KATCH_MCARDLE
        assert result.value == 1787.0
        assert result.lean_mass_kg == 65.6

    def test_with_zero_body_fat(self):
        """Edge case: 0% body fat (lean_mass == total weight)."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=70, height_cm=170, age=25, gender="male",
            body_fat_percentage=0,
        )
        # lean_mass = 70 * 1.0 = 70
        # BMR = 370 + (21.6 * 70) = 370 + 1512 = 1882.0
        assert result.equation_used == EquationUsed.KATCH_MCARDLE
        assert result.value == 1882.0
        assert result.lean_mass_kg == 70.0

    def test_body_fat_overrides_gender(self):
        """Katch-McArdle is gender-agnostic — gender doesn't affect result."""
        result_male = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="male",
            body_fat_percentage=20.0,
        )
        result_female = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="female",
            body_fat_percentage=20.0,
        )
        assert result_male.value == result_female.value
        assert result_male.equation_used == EquationUsed.KATCH_MCARDLE

    def test_body_fat_overrides_mifflin(self):
        """When body_fat is provided, Mifflin-St Jeor should NOT be used."""
        result = MetabolicEngine.calculate_bmr(
            weight_kg=80, height_cm=178, age=30, gender="male",
            body_fat_percentage=15.0,
        )
        assert result.equation_used == EquationUsed.KATCH_MCARDLE
        assert result.lean_mass_kg is not None


# ═══════════════════════════════════════════════════════════════════
# TDEE Calculation
# ═══════════════════════════════════════════════════════════════════

class TestTDEE:
    def test_sedentary(self):
        assert MetabolicEngine.calculate_tdee(1800, "sedentary") == 2160.0

    def test_light(self):
        assert MetabolicEngine.calculate_tdee(1800, "light") == 2475.0

    def test_moderate(self):
        assert MetabolicEngine.calculate_tdee(1800, "moderate") == 2790.0

    def test_active(self):
        assert MetabolicEngine.calculate_tdee(1800, "active") == 3105.0

    def test_very_active(self):
        assert MetabolicEngine.calculate_tdee(1800, "very_active") == 3420.0

    def test_unknown_defaults_to_moderate(self):
        """Unknown activity level should default to moderate multiplier (1.55)."""
        assert MetabolicEngine.calculate_tdee(1800, "unknown_level") == 2790.0


# ═══════════════════════════════════════════════════════════════════
# Calorie Target
# ═══════════════════════════════════════════════════════════════════

class TestCalorieTarget:
    def test_lose_weight_deficit(self):
        """Lose weight: TDEE - 500."""
        assert MetabolicEngine.calculate_calorie_target(2500, "lose_weight") == 2000

    def test_maintain(self):
        """Maintain: TDEE unchanged."""
        assert MetabolicEngine.calculate_calorie_target(2500, "maintain") == 2500

    def test_gain_muscle_surplus(self):
        """Gain muscle: TDEE + 350."""
        assert MetabolicEngine.calculate_calorie_target(2500, "gain_muscle") == 2850


# ═══════════════════════════════════════════════════════════════════
# Macro Split
# ═══════════════════════════════════════════════════════════════════

class TestMacroSplit:
    def test_lose_weight_high_protein(self):
        """lose_weight: 2.2g/kg protein, 25% fat, rest carbs."""
        macros = MetabolicEngine.calculate_macros(2000, 80, "lose_weight")
        # Protein: 80 * 2.2 = 176g → 704 kcal
        assert macros.protein_g == 176.0
        assert macros.protein_kcal == 704.0
        # Fat: 2000 * 0.25 = 500 kcal → 55.6g
        assert macros.fat_kcal == 500.0
        assert macros.fat_g == 55.6
        # Carbs: 2000 - 704 - 500 = 796 kcal → 199g
        assert macros.carbs_kcal == 796.0
        assert macros.carbs_g == 199.0

    def test_maintain_balanced(self):
        """maintain: 1.8g/kg protein, 28% fat, rest carbs."""
        macros = MetabolicEngine.calculate_macros(2500, 75, "maintain")
        # Protein: 75 * 1.8 = 135g → 540 kcal
        assert macros.protein_g == 135.0
        assert macros.protein_kcal == 540.0
        # Fat: 2500 * 0.28 = 700 kcal → 77.8g
        assert macros.fat_kcal == 700.0
        assert macros.fat_g == 77.8
        # Carbs: 2500 - 540 - 700 = 1260 kcal → 315g
        assert macros.carbs_kcal == 1260.0
        assert macros.carbs_g == 315.0

    def test_gain_muscle_surplus(self):
        """gain_muscle: 2.0g/kg protein, 25% fat, rest carbs."""
        macros = MetabolicEngine.calculate_macros(2850, 80, "gain_muscle")
        # Protein: 80 * 2.0 = 160g → 640 kcal
        assert macros.protein_g == 160.0
        # Fat: 2850 * 0.25 = 712.5 kcal → 79.2g
        assert macros.fat_kcal == 712.5
        # Carbs: 2850 - 640 - 712.5 = 1497.5 kcal → 374.4g
        assert macros.carbs_kcal == 1497.5

    def test_carbs_never_negative(self):
        """Edge case: very low calories should not produce negative carbs."""
        macros = MetabolicEngine.calculate_macros(500, 90, "lose_weight")
        assert macros.carbs_g >= 0
        assert macros.carbs_kcal >= 0


# ═══════════════════════════════════════════════════════════════════
# Full Profile (Integration)
# ═══════════════════════════════════════════════════════════════════

class TestComputeFullProfile:
    def test_full_profile_without_body_fat(self):
        """Full profile using Mifflin-St Jeor."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 8, 14)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            profile = MetabolicEngine.compute_full_profile(
                weight_kg=80,
                height_cm=178,
                date_of_birth=date(1995, 6, 15),
                gender="male",
                activity_level="moderate",
                goal="gain_muscle",
            )

        assert isinstance(profile, MetabolicSnapshot)
        assert profile.equation_used == EquationUsed.MIFFLIN_ST_JEOR
        assert profile.lean_mass_kg is None
        assert profile.bmr > 0
        assert profile.tdee > profile.bmr
        assert profile.calorie_target > profile.tdee  # gain muscle = surplus
        assert profile.macros.protein_g > 0
        assert profile.macros.carbs_g > 0
        assert profile.macros.fat_g > 0
        assert profile.goal == "gain_muscle"
        assert profile.activity_level == "moderate"

    def test_full_profile_with_body_fat(self):
        """Full profile using Katch-McArdle (body_fat provided)."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 8, 14)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            profile = MetabolicEngine.compute_full_profile(
                weight_kg=82,
                height_cm=178,
                date_of_birth=date(1995, 6, 15),
                gender="male",
                activity_level="active",
                goal="lose_weight",
                body_fat_percentage=22.0,
            )

        assert profile.equation_used == EquationUsed.KATCH_MCARDLE
        assert profile.lean_mass_kg is not None
        assert profile.lean_mass_kg == pytest.approx(63.96, rel=0.01)
        assert profile.calorie_target < profile.tdee  # deficit

    def test_full_profile_macros_sum_to_target(self):
        """The sum of macro kcal should approximately equal the calorie target."""
        with patch("app.services.metabolic.date") as mock_date:
            mock_date.today.return_value = date(2026, 8, 14)
            mock_date.side_effect = lambda *args, **kw: date(*args, **kw)

            profile = MetabolicEngine.compute_full_profile(
                weight_kg=75,
                height_cm=170,
                date_of_birth=date(1990, 1, 1),
                gender="female",
                activity_level="light",
                goal="maintain",
            )

        macro_total = (
            profile.macros.protein_kcal
            + profile.macros.carbs_kcal
            + profile.macros.fat_kcal
        )
        assert macro_total == pytest.approx(profile.calorie_target, abs=2)
