"""
BestMe — Vision Service
=========================
Claude-powered image analysis for meals and body composition.

Uses structured outputs (`output_config.format`), so the API guarantees the
response matches the JSON Schema. The previous implementation parsed free-form
JSON and hand-checked for a `foods` key — an entire class of runtime failures
that simply cannot happen now.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import anthropic
from anthropic import AsyncAnthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

# Structured outputs require Claude Sonnet 5 / Opus 4.8+ / Haiku 4.5.
# Sonnet 5 is the sweet spot here: high-resolution vision (2576px) matters
# for portion estimation, at a fraction of Opus pricing.
VISION_MODEL = "claude-sonnet-5"


class VisionError(Exception):
    """Raised when the vision provider cannot produce a usable result."""


# ── JSON Schemas ─────────────────────────────────────────────────
# Note: structured outputs reject numeric bounds (minimum/maximum) and
# string length constraints, and require additionalProperties: false.

MEAL_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "foods": {
            "type": "array",
            "description": "Every distinct food or ingredient visible in the photo.",
            "items": {
                "type": "object",
                "properties": {
                    "food": {
                        "type": "string",
                        "description": "Nombre del alimento en español.",
                    },
                    "weight_g": {
                        "type": "number",
                        "description": "Peso estimado de la porción en gramos.",
                    },
                    "calories": {
                        "type": "number",
                        "description": "Calorías totales de esa porción (kcal).",
                    },
                    "protein_g": {"type": "number", "description": "Proteína en gramos."},
                    "carbs_g": {"type": "number", "description": "Carbohidratos en gramos."},
                    "fat_g": {"type": "number", "description": "Grasa en gramos."},
                    "confidence": {
                        "type": "number",
                        "description": (
                            "Confianza en la estimación de la porción, de 0.0 a 1.0. "
                            "Baja cuando no hay referencia de escala en la foto."
                        ),
                    },
                },
                "required": [
                    "food",
                    "weight_g",
                    "calories",
                    "protein_g",
                    "carbs_g",
                    "fat_g",
                    "confidence",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["foods"],
    "additionalProperties": False,
}

BODY_SCAN_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "estimated_body_fat": {
            "type": "number",
            "description": "Porcentaje de grasa corporal estimado (0-100).",
        },
        "confidence_score": {
            "type": "number",
            "description": (
                "Confianza en la estimación, de 0.0 a 1.0. Debe ser baja si la "
                "pose, la ropa o la iluminación dificultan la valoración."
            ),
        },
        "notes": {
            "type": "string",
            "description": "Observaciones breves en español sobre lo que se aprecia.",
        },
        "limiting_factors": {
            "type": "array",
            "description": "Qué redujo la confianza (ropa holgada, ángulo, luz...).",
            "items": {"type": "string"},
        },
    },
    "required": ["estimated_body_fat", "confidence_score", "notes", "limiting_factors"],
    "additionalProperties": False,
}


MEAL_SYSTEM_PROMPT = (
    "Eres un dietista clínico analizando la foto de una comida.\n\n"
    "Identifica cada alimento e ingrediente visible por separado. Estima el peso "
    "de cada porción en gramos usando las referencias de escala que veas: el tamaño "
    "del plato, los cubiertos, un vaso, una mano. Calcula el perfil nutricional a "
    "partir de ese peso.\n\n"
    "Una fotografía no tiene profundidad, así que el peso es la parte más incierta "
    "de la estimación. Refleja esa incertidumbre en 'confidence': usa valores altos "
    "solo cuando haya una referencia de escala clara, y bajos cuando estés infiriendo "
    "el tamaño de la porción. No infles la confianza."
)

BODY_SCAN_SYSTEM_PROMPT = (
    "Eres un antropometrista evaluando una foto corporal para estimar el porcentaje "
    "de grasa corporal a partir de proporciones visibles y definición muscular.\n\n"
    "Esta estimación es intrínsecamente imprecisa: la ropa, la pose, la iluminación y "
    "el ángulo la afectan mucho, y el margen de error habitual es de varios puntos "
    "porcentuales. Sé honesto en 'confidence_score' y enumera en 'limiting_factors' "
    "todo lo que dificulte la valoración. Es preferible una confianza baja y sincera "
    "a una cifra segura y equivocada."
)


# ── Mock fallbacks (no API key configured) ───────────────────────
# Marked explicitly so mock data is never mistaken for a real analysis.

_MOCK_MEAL: List[Dict[str, Any]] = [
    {
        "food": "[EJEMPLO] Pechuga de pollo a la plancha",
        "weight_g": 150.0,
        "calories": 247.0,
        "protein_g": 46.5,
        "carbs_g": 0.0,
        "fat_g": 5.4,
        "confidence": 0.0,
    },
    {
        "food": "[EJEMPLO] Arroz integral",
        "weight_g": 100.0,
        "calories": 111.0,
        "protein_g": 2.6,
        "carbs_g": 23.0,
        "fat_g": 0.9,
        "confidence": 0.0,
    },
]

_MOCK_BODY_SCAN: Dict[str, Any] = {
    "estimated_body_fat": 15.5,
    "confidence_score": 0.0,
    "notes": "Datos de ejemplo: no hay ANTHROPIC_API_KEY configurada.",
    "limiting_factors": ["sin_api_key"],
    "is_mock": True,
}


class VisionService:
    """Stateless service for Claude vision calls."""

    @staticmethod
    def _client() -> AsyncAnthropic | None:
        """Return a configured client, or None when running in mock mode."""
        settings = get_settings()
        key = settings.anthropic_api_key
        if not key or key == "mock":
            return None
        return AsyncAnthropic(api_key=key)

    @staticmethod
    def is_configured() -> bool:
        """Whether real AI analysis is available."""
        return VisionService._client() is not None

    @staticmethod
    async def _analyze(
        *,
        base64_image: str,
        media_type: str,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
        max_tokens: int,
    ) -> Dict[str, Any]:
        """Send one image to Claude and return the schema-validated result."""
        client = VisionService._client()
        if client is None:  # pragma: no cover - guarded by callers
            raise VisionError("El servicio de IA no está configurado.")

        try:
            response = await client.messages.create(
                model=VISION_MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                output_config={"format": {"type": "json_schema", "schema": schema}},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": base64_image,
                                },
                            },
                            {"type": "text", "text": user_prompt},
                        ],
                    }
                ],
            )
        except anthropic.RateLimitError as exc:
            logger.warning("Anthropic rate limit hit: %s", exc)
            raise VisionError(
                "El servicio de IA está saturado ahora mismo. Inténtalo en unos segundos."
            ) from exc
        except anthropic.APIConnectionError as exc:
            logger.warning("Cannot reach Anthropic API: %s", exc)
            raise VisionError("No se pudo contactar con el servicio de IA.") from exc
        except anthropic.APIStatusError as exc:
            logger.error("Anthropic API error %s: %s", exc.status_code, exc)
            raise VisionError("El servicio de IA devolvió un error.") from exc

        # A refusal returns HTTP 200 with an empty/partial body — check before reading.
        if response.stop_reason == "refusal":
            logger.warning("Anthropic refused the request: %s", response.stop_details)
            raise VisionError("La IA no pudo procesar esta imagen.")

        if response.stop_reason == "max_tokens":
            logger.warning("Vision response truncated by max_tokens")
            raise VisionError("La respuesta de la IA quedó incompleta. Prueba otra foto.")

        parsed = getattr(response, "parsed_output", None)
        if parsed is not None:
            return parsed

        # Fall back to the text block, which structured outputs guarantee is
        # valid JSON matching the schema.
        import json

        for block in response.content:
            if getattr(block, "type", None) == "text":
                return json.loads(block.text)

        raise VisionError("La IA no devolvió ningún resultado.")

    # ── Public API ───────────────────────────────────────────────

    @staticmethod
    async def analyze_meal_image(
        base64_image: str,
        media_type: str = "image/jpeg",
    ) -> List[Dict[str, Any]]:
        """
        Estimate the nutritional content of a meal photo.

        Returns a list of detected foods. When no API key is configured the
        result is clearly-labelled sample data with confidence 0.
        """
        if not VisionService.is_configured():
            logger.warning("ANTHROPIC_API_KEY not set — returning sample meal data")
            return [dict(item) for item in _MOCK_MEAL]

        result = await VisionService._analyze(
            base64_image=base64_image,
            media_type=media_type,
            system_prompt=MEAL_SYSTEM_PROMPT,
            user_prompt="Analiza esta comida y desglosa cada alimento que veas.",
            schema=MEAL_SCHEMA,
            max_tokens=4096,
        )

        foods = result.get("foods", [])
        if not foods:
            raise VisionError("No se reconoció ningún alimento en la foto.")
        return foods

    @staticmethod
    async def analyze_body_composition(
        base64_image: str,
        media_type: str = "image/jpeg",
    ) -> Dict[str, Any]:
        """
        Estimate body fat percentage from an orthogonal body photo.

        The caller is expected to surface `confidence_score` to the user and
        require confirmation before this changes their metabolic profile.
        """
        if not VisionService.is_configured():
            logger.warning("ANTHROPIC_API_KEY not set — returning sample scan data")
            return dict(_MOCK_BODY_SCAN)

        result = await VisionService._analyze(
            base64_image=base64_image,
            media_type=media_type,
            system_prompt=BODY_SCAN_SYSTEM_PROMPT,
            user_prompt="Estima mi porcentaje de grasa corporal a partir de esta foto.",
            schema=BODY_SCAN_SCHEMA,
            max_tokens=1024,
        )
        result["is_mock"] = False
        return result
