"""
BestMe — Vision Service
=========================
Handles integration with OpenAI GPT-4 Vision for meal analysis.
Uses a strict clinical dietitian prompt and enforces JSON output.
"""

import json
from typing import List, Dict, Any

from openai import AsyncOpenAI
from openai import OpenAIError

from app.config import get_settings


class VisionService:
    """
    Stateless service to interact with OpenAI Vision API.
    """

    # The strict prompt provided by the user for Phase 4
    SYSTEM_PROMPT = (
        "Asume el rol de un dietista clínico. Identifica exhaustivamente todos los "
        "alimentos y sub-ingredientes visibles en la imagen adjunta. Estima los tamaños "
        "de las porciones en gramos basados en proporciones visuales estándar, y calcula "
        "el perfil nutricional. Retorna la respuesta estrictamente como un objeto JSON "
        "que contenga una única clave 'foods' cuyo valor sea un array de objetos JSON "
        "que contengan exclusivamente las claves: 'food', 'weight_g', 'calories', "
        "'protein_g', 'carbs_g', 'fat_g'. No incluyas marcadores de bloque de código "
        "ni texto introductorio."
    )

    @staticmethod
    async def analyze_meal_image(base64_image: str) -> List[Dict[str, Any]]:
        """
        Sends the base64 encoded image to GPT-4o for nutritional analysis.
        Returns the parsed 'foods' array from the JSON response.
        """
        settings = get_settings()
        
        # Fallback to mock data if no API key is present
        if not settings.openai_api_key or settings.openai_api_key == "mock":
            return [
                {
                    "food": "Pechuga de pollo a la plancha (Mock)",
                    "weight_g": 150,
                    "calories": 247,
                    "protein_g": 46.5,
                    "carbs_g": 0,
                    "fat_g": 5.4,
                },
                {
                    "food": "Arroz integral (Mock)",
                    "weight_g": 100,
                    "calories": 111,
                    "protein_g": 2.6,
                    "carbs_g": 23,
                    "fat_g": 0.9,
                }
            ]

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": VisionService.SYSTEM_PROMPT
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Por favor analiza esta comida."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "high"
                                },
                            },
                        ],
                    }
                ],
                max_tokens=1000,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content
            if not result_text:
                raise ValueError("Respuesta vacía de OpenAI")

            parsed_data = json.loads(result_text)
            
            if "foods" not in parsed_data:
                # Si por alguna razón devolvió el array directo a pesar de pedir el objeto
                if isinstance(parsed_data, list):
                    return parsed_data
                raise ValueError("El JSON devuelto no contiene la clave 'foods'")
                
            return parsed_data["foods"]

        except OpenAIError as e:
            # Re-raise standard exception for the router to handle
            raise Exception(f"Error en OpenAI API: {str(e)}")
        except json.JSONDecodeError:
            raise Exception("No se pudo parsear el JSON devuelto por la IA")

    BODY_SCAN_PROMPT = (
        "Asume el rol de un antropometrista clínico experto. Analiza la imagen "
        "ortogonal adjunta evaluando los polígonos perimetrales y la silueta corporal. "
        "Estima la densidad del tejido adiposo y retorna la respuesta estrictamente "
        "como un objeto JSON que contenga las claves: 'estimated_body_fat' (float), "
        "'confidence_score' (float entre 0.0 y 1.0), y 'scan_metadata' (objeto JSON "
        "con observaciones como 'waist_hip_ratio_category' o notas anatómicas). "
        "No incluyas marcadores de bloque de código ni texto introductorio."
    )

    @staticmethod
    async def analyze_body_composition(base64_image: str) -> Dict[str, Any]:
        """
        Sends the base64 encoded image of a full body scan to GPT-4o
        to estimate body fat percentage based on visual proportions.
        """
        settings = get_settings()
        
        # Fallback to mock data if no API key is present
        if not settings.openai_api_key or settings.openai_api_key == "mock":
            return {
                "estimated_body_fat": 15.5,
                "confidence_score": 0.88,
                "scan_metadata": {
                    "notes": "Estimación mock basada en proporciones estándar",
                    "waist_hip_ratio_category": "athletic"
                }
            }

        client = AsyncOpenAI(api_key=settings.openai_api_key)

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": VisionService.BODY_SCAN_PROMPT
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Por favor estima mi porcentaje de grasa corporal basándote en esta foto ortogonal."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "high"
                                },
                            },
                        ],
                    }
                ],
                max_tokens=500,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content
            if not result_text:
                raise ValueError("Respuesta vacía de OpenAI")

            parsed_data = json.loads(result_text)
            
            # Validations
            if "estimated_body_fat" not in parsed_data:
                raise ValueError("El JSON devuelto no contiene 'estimated_body_fat'")
                
            return parsed_data

        except OpenAIError as e:
            raise Exception(f"Error en OpenAI API: {str(e)}")
        except json.JSONDecodeError:
            raise Exception("No se pudo parsear el JSON devuelto por la IA")
