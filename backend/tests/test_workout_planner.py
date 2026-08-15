"""
BestMe — Workout Planner Tests
=================================
Unit tests for WorkoutPlanner, the rule-based session generator.

No network, no API key, no cost — these exercise pure functions, the same
way test_metabolic.py exercises MetabolicEngine.
"""

import pytest

from app.services.workout_planner import (
    CARDIO_FINISHER_MINUTES,
    EXERCISE_DATABASE,
    GOAL_SCHEMES,
    GYM_EQUIPMENT,
    HOME_EQUIPMENT,
    SECONDS_PER_SET,
    SESSION_SIZE,
    WARMUP_MINUTES,
    Location,
    WorkoutPlanner,
)

EXERCISES_BY_NAME = {ex.name: ex for ex in EXERCISE_DATABASE}


def expected_duration(session_size: int, sets: int, rest_seconds: int, finisher: bool) -> int:
    """Recomputes WorkoutPlanner's duration formula for assertions."""
    work_minutes = session_size * sets * (rest_seconds + SECONDS_PER_SET) / 60.0
    return round(WARMUP_MINUTES + work_minutes + (CARDIO_FINISHER_MINUTES if finisher else 0))


# ═══════════════════════════════════════════════════════════════════
# Location filtering
# ═══════════════════════════════════════════════════════════════════


class TestLocationFiltering:
    @pytest.mark.parametrize("goal", list(GOAL_SCHEMES) + ["unknown_goal"])
    @pytest.mark.parametrize("activity_level", list(SESSION_SIZE) + ["unknown_activity"])
    def test_home_never_requires_equipment(self, goal, activity_level):
        """Every exercise in a home plan must be doable with nothing but bodyweight."""
        plan = WorkoutPlanner.compute_plan(
            goal=goal, activity_level=activity_level, location="home", seed=0
        )
        for planned in plan.exercises:
            db_exercise = EXERCISES_BY_NAME[planned.name]
            assert db_exercise.equipment.issubset(HOME_EQUIPMENT), (
                f"{planned.name} requiere {db_exercise.equipment}, "
                f"pero un plan en casa solo puede pedir {HOME_EQUIPMENT}"
            )

    def test_home_never_leaves_a_category_empty(self):
        """A full 6-exercise plan at home must actually contain 6 exercises."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="very_active", location="home", seed=0
        )
        assert len(plan.exercises) == 6

    def test_gym_can_include_equipment_exercises(self):
        """Over several seeds, a gym plan should surface at least one non-bodyweight pick."""
        seen_equipment: set[str] = set()
        for seed in range(10):
            plan = WorkoutPlanner.compute_plan(
                goal="gain_muscle", activity_level="very_active", location="gym", seed=seed
            )
            for planned in plan.exercises:
                seen_equipment |= EXERCISES_BY_NAME[planned.name].equipment

        assert seen_equipment - HOME_EQUIPMENT, "el gym nunca propuso nada que use equipo"

    def test_unknown_location_raises(self):
        with pytest.raises(ValueError):
            WorkoutPlanner.compute_plan(goal="maintain", activity_level="moderate", location="beach")


# ═══════════════════════════════════════════════════════════════════
# Session length
# ═══════════════════════════════════════════════════════════════════


class TestSessionLength:
    @pytest.mark.parametrize("activity_level, expected_size", SESSION_SIZE.items())
    def test_session_length_scales_with_activity(self, activity_level, expected_size):
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level=activity_level, location="home", seed=0
        )
        assert len(plan.exercises) == expected_size

    def test_unknown_activity_level_defaults_to_moderate_size(self):
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="marathon_monk", location="home", seed=0
        )
        assert len(plan.exercises) == SESSION_SIZE["moderate"]

    def test_first_four_categories_are_always_present(self):
        """Legs/push/pull/shoulders come before core/full_body in every plan."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="sedentary", location="home", seed=0
        )
        groups = [ex.muscle_group.value for ex in plan.exercises]
        assert groups == ["legs", "push", "pull", "shoulders"]


# ═══════════════════════════════════════════════════════════════════
# Goal scheme (sets / reps / rest)
# ═══════════════════════════════════════════════════════════════════


class TestGoalScheme:
    def test_lose_weight_scheme(self):
        plan = WorkoutPlanner.compute_plan(
            goal="lose_weight", activity_level="moderate", location="home", seed=0
        )
        for ex in plan.exercises:
            assert ex.sets == 3
            assert ex.rest_seconds == 30
            assert ex.reps_label in ("15-20", "45 s")

    def test_gain_muscle_scheme(self):
        plan = WorkoutPlanner.compute_plan(
            goal="gain_muscle", activity_level="moderate", location="home", seed=0
        )
        for ex in plan.exercises:
            assert ex.sets == 4
            assert ex.rest_seconds == 90
            assert ex.reps_label in ("6-10", "30 s")

    def test_unknown_goal_falls_back_to_maintain(self):
        fallback = WorkoutPlanner.compute_plan(
            goal="become_a_superhero", activity_level="moderate", location="home", seed=0
        )
        maintain = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="home", seed=0
        )
        assert fallback.exercises == maintain.exercises

    def test_timed_exercises_report_seconds_not_reps(self):
        """A plank's reps_label must never be handed a rep-count string."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="very_active", location="home", seed=0
        )
        for planned in plan.exercises:
            if EXERCISES_BY_NAME[planned.name].is_timed:
                assert planned.reps_label.endswith(" s")


# ═══════════════════════════════════════════════════════════════════
# Cardio finisher
# ═══════════════════════════════════════════════════════════════════


class TestCardioFinisher:
    def test_only_lose_weight_gets_a_finisher(self):
        for goal in GOAL_SCHEMES:
            plan = WorkoutPlanner.compute_plan(
                goal=goal, activity_level="moderate", location="home", seed=0
            )
            assert plan.includes_cardio_finisher == (goal == "lose_weight")
            if goal == "lose_weight":
                assert plan.cardio_finisher_note is not None
            else:
                assert plan.cardio_finisher_note is None


# ═══════════════════════════════════════════════════════════════════
# Duration & calorie estimate
# ═══════════════════════════════════════════════════════════════════


class TestEstimates:
    def test_duration_exact_for_sedentary_maintain(self):
        """4 exercises x 3 sets x (60+45)s = 21 min of work + 5 min warmup = 26."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="sedentary", location="home", seed=0
        )
        assert plan.estimated_duration_minutes == 26

    def test_duration_exact_for_sedentary_gain_muscle(self):
        """4 x 4 x (90+45)s = 36 min + 5 = 41."""
        plan = WorkoutPlanner.compute_plan(
            goal="gain_muscle", activity_level="sedentary", location="home", seed=0
        )
        assert plan.estimated_duration_minutes == 41

    def test_duration_exact_for_active_gain_muscle(self):
        """6 x 4 x (90+45)s = 54 min + 5 = 59."""
        plan = WorkoutPlanner.compute_plan(
            goal="gain_muscle", activity_level="active", location="home", seed=0
        )
        assert plan.estimated_duration_minutes == 59

    @pytest.mark.parametrize("activity_level", list(SESSION_SIZE))
    @pytest.mark.parametrize("goal", list(GOAL_SCHEMES))
    def test_duration_matches_formula(self, activity_level, goal):
        """General property: the engine's output matches its own documented formula."""
        plan = WorkoutPlanner.compute_plan(
            goal=goal, activity_level=activity_level, location="gym", seed=0
        )
        scheme = GOAL_SCHEMES[goal]
        expected = expected_duration(
            SESSION_SIZE[activity_level], scheme.sets, scheme.rest_seconds, goal == "lose_weight"
        )
        assert plan.estimated_duration_minutes == expected

    def test_calories_scale_with_weight(self):
        light = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="home", weight_kg=60, seed=0
        )
        heavy = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="home", weight_kg=100, seed=0
        )
        assert heavy.estimated_calories_burned > light.estimated_calories_burned

    def test_calories_exact_value(self):
        """MET 5.0 x 80 kg x (26 min / 60) = 173.33... -> 173.3 kcal."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="sedentary", location="home", weight_kg=80, seed=0
        )
        assert plan.estimated_duration_minutes == 26
        assert plan.estimated_calories_burned == 173.3

    @pytest.mark.parametrize("weight_kg", [None, 0, -5])
    def test_calories_omitted_without_a_usable_weight(self, weight_kg):
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="home", weight_kg=weight_kg, seed=0
        )
        assert plan.estimated_calories_burned is None


# ═══════════════════════════════════════════════════════════════════
# Variety (seed-based rotation)
# ═══════════════════════════════════════════════════════════════════


class TestVariety:
    def test_different_seeds_can_change_the_pick(self):
        """Legs has 3 bodyweight options at home — seeds 0/1/2 must cover all three."""
        picks = {
            WorkoutPlanner.compute_plan(
                goal="maintain", activity_level="sedentary", location="home", seed=seed
            ).exercises[0].name
            for seed in range(3)
        }
        assert len(picks) == 3

    def test_same_seed_is_reproducible(self):
        first = WorkoutPlanner.compute_plan(
            goal="lose_weight", activity_level="active", location="gym", seed=42
        )
        second = WorkoutPlanner.compute_plan(
            goal="lose_weight", activity_level="active", location="gym", seed=42
        )
        assert first == second

    def test_seed_defaults_to_today_and_stays_reproducible_within_the_day(self):
        """Two calls with no explicit seed on the same day must agree."""
        first = WorkoutPlanner.compute_plan(goal="maintain", activity_level="moderate", location="gym")
        second = WorkoutPlanner.compute_plan(goal="maintain", activity_level="moderate", location="gym")
        assert first == second


# ═══════════════════════════════════════════════════════════════════
# Response shape sanity
# ═══════════════════════════════════════════════════════════════════


class TestPlanShape:
    def test_location_and_goal_echoed_back(self):
        plan = WorkoutPlanner.compute_plan(
            goal="gain_muscle", activity_level="active", location="gym", seed=0
        )
        assert plan.location == Location.GYM
        assert plan.goal == "gain_muscle"

    def test_coach_note_mentions_the_location(self):
        home_plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="home", seed=0
        )
        gym_plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="moderate", location="gym", seed=0
        )
        assert "casa" in home_plan.coach_note
        assert "gimnasio" in gym_plan.coach_note

    def test_no_two_exercises_share_a_name_within_one_plan(self):
        """Distinct muscle groups shouldn't accidentally recommend the same movement."""
        plan = WorkoutPlanner.compute_plan(
            goal="maintain", activity_level="very_active", location="gym", seed=0
        )
        names = [ex.name for ex in plan.exercises]
        assert len(names) == len(set(names))
