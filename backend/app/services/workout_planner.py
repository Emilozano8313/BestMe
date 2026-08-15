"""
BestMe — Workout Planner Service
===================================
Deterministic, rule-based session builder — no AI call, no cost.

Turns the user's stored profile (goal, activity level, weight) plus where
they're training (home vs gym) into a balanced set of exercises, the same
way MetabolicEngine turns a profile into calorie/macro targets. There is no
Claude request anywhere in this file: it works with no ANTHROPIC_API_KEY and
never costs anything to call.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class Location(str, Enum):
    HOME = "home"
    GYM = "gym"


class MuscleGroup(str, Enum):
    LEGS = "legs"
    PUSH = "push"
    PULL = "pull"
    SHOULDERS = "shoulders"
    CORE = "core"
    FULL_BODY = "full_body"


# Filled in this order when a session is short — legs and the two main
# pushing/pulling patterns always make the cut before accessories.
CATEGORY_ORDER: tuple[MuscleGroup, ...] = (
    MuscleGroup.LEGS,
    MuscleGroup.PUSH,
    MuscleGroup.PULL,
    MuscleGroup.SHOULDERS,
    MuscleGroup.CORE,
    MuscleGroup.FULL_BODY,
)

# More active users get a longer, fuller session.
SESSION_SIZE: dict[str, int] = {
    "sedentary": 4,
    "light": 4,
    "moderate": 5,
    "active": 6,
    "very_active": 6,
}
DEFAULT_SESSION_SIZE = SESSION_SIZE["moderate"]

HOME_EQUIPMENT: frozenset[str] = frozenset({"bodyweight"})
GYM_EQUIPMENT: frozenset[str] = frozenset(
    {
        "bodyweight",
        "dumbbell",
        "barbell",
        "bench",
        "machine",
        "cable",
        "pull_up_bar",
        "kettlebell",
    }
)


@dataclass(frozen=True)
class Exercise:
    name: str
    muscle_group: MuscleGroup
    equipment: frozenset[str]
    is_compound: bool = False
    # True => the rep count is actually a hold time in seconds (e.g. plank).
    is_timed: bool = False


# Every category has at least two bodyweight-only options, so a home session
# never comes up short on candidates.
EXERCISE_DATABASE: tuple[Exercise, ...] = (
    # ── Legs ──────────────────────────────────────────────────────
    Exercise("Sentadillas", MuscleGroup.LEGS, frozenset({"bodyweight"}), is_compound=True),
    Exercise("Zancadas", MuscleGroup.LEGS, frozenset({"bodyweight"})),
    Exercise("Puente de glúteo", MuscleGroup.LEGS, frozenset({"bodyweight"})),
    Exercise("Sentadilla con barra", MuscleGroup.LEGS, frozenset({"barbell"}), is_compound=True),
    Exercise("Prensa de piernas", MuscleGroup.LEGS, frozenset({"machine"}), is_compound=True),
    Exercise(
        "Peso muerto rumano con mancuernas",
        MuscleGroup.LEGS,
        frozenset({"dumbbell"}),
        is_compound=True,
    ),
    # ── Push: chest, front shoulder, triceps ────────────────────────
    Exercise("Flexiones de pecho", MuscleGroup.PUSH, frozenset({"bodyweight"}), is_compound=True),
    Exercise("Fondos en silla", MuscleGroup.PUSH, frozenset({"bodyweight"})),
    Exercise(
        "Press de banca con barra",
        MuscleGroup.PUSH,
        frozenset({"barbell", "bench"}),
        is_compound=True,
    ),
    Exercise(
        "Press de pecho con mancuernas",
        MuscleGroup.PUSH,
        frozenset({"dumbbell", "bench"}),
        is_compound=True,
    ),
    Exercise("Fondos en paralelas", MuscleGroup.PUSH, frozenset({"machine"})),
    # ── Pull: back, biceps ───────────────────────────────────────────
    Exercise("Remo invertido en mesa", MuscleGroup.PULL, frozenset({"bodyweight"}), is_compound=True),
    Exercise("Superman", MuscleGroup.PULL, frozenset({"bodyweight"})),
    Exercise("Dominadas", MuscleGroup.PULL, frozenset({"pull_up_bar"}), is_compound=True),
    Exercise("Remo con barra", MuscleGroup.PULL, frozenset({"barbell"}), is_compound=True),
    Exercise("Jalón al pecho", MuscleGroup.PULL, frozenset({"cable"}), is_compound=True),
    Exercise(
        "Remo con mancuerna a una mano",
        MuscleGroup.PULL,
        frozenset({"dumbbell", "bench"}),
    ),
    # ── Shoulders ─────────────────────────────────────────────────────
    Exercise("Flexiones pike", MuscleGroup.SHOULDERS, frozenset({"bodyweight"})),
    Exercise(
        "Press militar con barra", MuscleGroup.SHOULDERS, frozenset({"barbell"}), is_compound=True
    ),
    Exercise(
        "Elevaciones laterales con mancuernas", MuscleGroup.SHOULDERS, frozenset({"dumbbell"})
    ),
    # ── Core ──────────────────────────────────────────────────────────
    Exercise("Plancha abdominal", MuscleGroup.CORE, frozenset({"bodyweight"}), is_timed=True),
    Exercise("Abdominales bicicleta", MuscleGroup.CORE, frozenset({"bodyweight"})),
    Exercise("Elevación de piernas", MuscleGroup.CORE, frozenset({"bodyweight"})),
    Exercise("Plancha lateral", MuscleGroup.CORE, frozenset({"bodyweight"}), is_timed=True),
    Exercise("Rueda abdominal", MuscleGroup.CORE, frozenset({"machine"})),
    # ── Full body / conditioning finisher ──────────────────────────────
    Exercise("Burpees", MuscleGroup.FULL_BODY, frozenset({"bodyweight"}), is_compound=True),
    Exercise("Escaladores", MuscleGroup.FULL_BODY, frozenset({"bodyweight"})),
    Exercise(
        "Swings con kettlebell", MuscleGroup.FULL_BODY, frozenset({"kettlebell"}), is_compound=True
    ),
    Exercise("Remo en máquina (cardio)", MuscleGroup.FULL_BODY, frozenset({"machine"})),
)


@dataclass(frozen=True)
class GoalScheme:
    """Sets/reps/rest scheme, tuned per fitness goal."""
    sets: int
    reps_label: str  # shown for rep-based exercises, e.g. "12-15"
    timed_seconds: int  # hold time shown for is_timed exercises
    rest_seconds: int
    note: str


GOAL_SCHEMES: dict[str, GoalScheme] = {
    "lose_weight": GoalScheme(
        sets=3,
        reps_label="15-20",
        timed_seconds=45,
        rest_seconds=30,
        note="Descansa poco entre series para mantener el ritmo cardiovascular alto.",
    ),
    "maintain": GoalScheme(
        sets=3,
        reps_label="10-12",
        timed_seconds=35,
        rest_seconds=60,
        note="Rutina equilibrada para sostener tu condición física actual.",
    ),
    "gain_muscle": GoalScheme(
        sets=4,
        reps_label="6-10",
        timed_seconds=30,
        rest_seconds=90,
        note="Prioriza la técnica y aumenta el peso de forma progresiva.",
    ),
}
DEFAULT_GOAL_SCHEME = GOAL_SCHEMES["maintain"]

# Resistance training, multiple exercises, moderate-vigorous effort — a
# standard Compendium-of-Physical-Activities value for a mixed circuit like
# this. workouts.py's own per-exercise MET table goes up to 6.0 for a single
# vigorous lift (squat/deadlift); this is the blended average across a
# whole session that also includes lighter accessory work and rest between
# sets.
SESSION_MET = 5.0

WARMUP_MINUTES = 5
# Rough seconds of working time per set, on top of the rest between sets —
# used only to estimate session length, not for calorie precision.
SECONDS_PER_SET = 45
CARDIO_FINISHER_MINUTES = 15
CARDIO_FINISHER_NOTE = "Cardio de intensidad moderada: 15-20 minutos (bici, cinta o cuerda)."


@dataclass(frozen=True)
class PlannedExercise:
    name: str
    muscle_group: MuscleGroup
    sets: int
    reps_label: str
    rest_seconds: int
    is_compound: bool


@dataclass(frozen=True)
class WorkoutPlan:
    location: Location
    goal: str
    exercises: tuple[PlannedExercise, ...]
    warmup_minutes: int
    includes_cardio_finisher: bool
    cardio_finisher_note: Optional[str]
    estimated_duration_minutes: int
    estimated_calories_burned: Optional[float]
    coach_note: str


class WorkoutPlanner:
    """Stateless service that turns a profile into a balanced session."""

    @staticmethod
    def _equipment_for(location: str) -> frozenset[str]:
        return GYM_EQUIPMENT if location == Location.GYM.value else HOME_EQUIPMENT

    @staticmethod
    def _pick_for_category(
        category: MuscleGroup, equipment: frozenset[str], seed: int
    ) -> Optional[Exercise]:
        """
        Choose one exercise for a muscle group from what the location allows.

        `seed` rotates the pick among the candidates rather than always
        returning the first match — callers pass a day-based seed so the
        plan varies day to day without needing any state.
        """
        candidates = [
            exercise
            for exercise in EXERCISE_DATABASE
            if exercise.muscle_group == category and exercise.equipment.issubset(equipment)
        ]
        if not candidates:
            return None
        return candidates[seed % len(candidates)]

    @classmethod
    def compute_plan(
        cls,
        *,
        goal: str,
        activity_level: str,
        location: str,
        weight_kg: Optional[float] = None,
        seed: Optional[int] = None,
    ) -> WorkoutPlan:
        """
        Build today's balanced session.

        Args:
            goal: one of the FitnessGoal values; unknown values fall back
                  to the "maintain" scheme rather than raising.
            activity_level: one of the ActivityLevel values; unknown values
                  fall back to a moderate-length session.
            location: "home" or "gym" — required, raises on anything else.
            weight_kg: used only to estimate calories burned; omitted (or
                  non-positive) skips the estimate rather than guessing.
            seed: rotates exercise picks; defaults to today's ordinal date
                  so the plan varies day to day. Pass an explicit value for
                  reproducible output (tests, previews).
        """
        if location not in (Location.HOME.value, Location.GYM.value):
            raise ValueError(f"Ubicación desconocida: {location!r}. Usa 'home' o 'gym'.")

        scheme = GOAL_SCHEMES.get(goal, DEFAULT_GOAL_SCHEME)
        session_size = SESSION_SIZE.get(activity_level, DEFAULT_SESSION_SIZE)
        equipment = cls._equipment_for(location)
        effective_seed = date.today().toordinal() if seed is None else seed

        planned: list[PlannedExercise] = []
        for category in CATEGORY_ORDER[:session_size]:
            exercise = cls._pick_for_category(category, equipment, effective_seed)
            if exercise is None:
                # No exercise in the database currently leaves a category
                # empty at either location, but a data change could — skip
                # rather than crash the whole plan.
                continue
            reps_label = f"{scheme.timed_seconds} s" if exercise.is_timed else scheme.reps_label
            planned.append(
                PlannedExercise(
                    name=exercise.name,
                    muscle_group=exercise.muscle_group,
                    sets=scheme.sets,
                    reps_label=reps_label,
                    rest_seconds=scheme.rest_seconds,
                    is_compound=exercise.is_compound,
                )
            )

        includes_finisher = goal == "lose_weight"

        work_minutes = sum(ex.sets * (ex.rest_seconds + SECONDS_PER_SET) for ex in planned) / 60.0
        estimated_duration = round(
            WARMUP_MINUTES
            + work_minutes
            + (CARDIO_FINISHER_MINUTES if includes_finisher else 0)
        )

        estimated_calories = None
        if weight_kg and weight_kg > 0:
            estimated_calories = round(
                SESSION_MET * weight_kg * (estimated_duration / 60.0), 1
            )

        location_note = (
            "Puedes hacerlo en casa sin ningún equipo."
            if location == Location.HOME.value
            else "Aprovecha el equipo del gimnasio para más resistencia y variedad."
        )

        return WorkoutPlan(
            location=Location(location),
            goal=goal,
            exercises=tuple(planned),
            warmup_minutes=WARMUP_MINUTES,
            includes_cardio_finisher=includes_finisher,
            cardio_finisher_note=CARDIO_FINISHER_NOTE if includes_finisher else None,
            estimated_duration_minutes=estimated_duration,
            estimated_calories_burned=estimated_calories,
            coach_note=f"{scheme.note} {location_note}",
        )
