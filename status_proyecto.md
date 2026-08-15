# 📋 BestMe — Status del Proyecto

> **Última actualización:** 2026-08-14  
> **Versión:** 0.3.0  
> **Fase actual:** Fase 3 — Motor Metabólico Adaptativo ✅

---

## 🏗️ Estado General

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend (FastAPI) | ✅ Scaffolding completo | Estructura de carpetas, config, health endpoint |
| Base de Datos (PostgreSQL) | ✅ Tablas migradas | 5 tablas core y extensiones listas |
| Frontend (React Native/Expo) | ✅ Completo + Onboarding | 4 pantallas premium + Stack de Auth + Onboarding 4 pasos |
| Docker Compose | ✅ Listo | `api` + `db` con healthchecks |
| Autenticación | ✅ Completada | JWT, bcrypt, AuthContext, screens Login/Register |
| Motor Metabólico | ✅ Completado | Mifflin-St Jeor / Katch-McArdle, TDEE, macros dinámicos |
| Módulo Nutrición IA | ✅ Fase 4 | OpenAI GPT-4 Vision, validación móvil |
| Entrenador Biomecánico | ✅ Fase 5 | Cinemática Edge AI, prevención de lesiones, MET |
| Escáner Corporal | ✅ Fase 6 | Estimación visual de grasa, re-calibración a Katch-McArdle |

---

## 🗄️ Modelos de Base de Datos (SQLAlchemy)

Se han creado las siguientes 5 tablas base en PostgreSQL (esquema asíncrono con `asyncpg`):

1. **`users`**: Perfiles de usuario (auth, altura, peso, body_fat, meta de fitness, nivel de actividad).
2. **`meals`**: Registro de comidas (tipo, descripción, totales macro). Incluye JSONB para `detected_foods` y soporte para validación humana (`manually_adjusted`).
3. **`body_scans`**: Escaneos corporales con % de grasa y score de confianza, más `scan_metadata` en JSONB.
4. **`workout_sessions`**: Entrenamientos. Registra repeticiones totales, duración y un array JSONB de `sets` con el `form_score` de MediaPipe, además del cálculo de calorías `calories_burned`.
5. **`daily_metrics`**: Agregados diarios (Restricción UNIQUE por usuario+fecha). Almacena TMB, TDEE, macros objetivo y macros **consumidos/quemados** reales del día.

---

## 🔐 Sistema de Autenticación

### Backend
- **Core de Seguridad (`app/core/security.py`)**: Hashing con `bcrypt` (vía `passlib`), firmas de JWT (access/refresh tokens) con `python-jose`.
- **Dependencias FastAPI**: `get_current_user` y `get_current_active_user` para extraer y validar JWT desde el header `Authorization`.
- **Schemas (`app/schemas/user.py`, `auth.py`)**: Pydantic models para validación robusta de entrada/salida.
- **Router (`app/api/auth.py`)**:
  - `POST /api/auth/register`: Creación de usuario.
  - `POST /api/auth/login`: Autenticación y generación de tokens (compatible con OAuth2).
  - `POST /api/auth/refresh`: Renovación del access token.
  - `GET /api/auth/me`: Retorna el perfil del usuario validado.

### Frontend
- **Global Context (`context/AuthContext.tsx`)**: Gestiona el token JWT, el estado de sesión del usuario, e intercepta las rutas protegidas (`useSegments` de Expo Router).
- **Pantalla de Login (`app/(auth)/login.tsx`)**: Formulario premium con feedback visual, integrado con el backend.
- **Pantalla de Register (`app/(auth)/register.tsx`)**: Flujo inicial para nombre, correo y contraseña.

---

## ⚡ Motor Metabólico Adaptativo (Fase 3)

### Backend — Servicio de Cálculo (`app/services/metabolic.py`)

Clase `MetabolicEngine` con lógica pura (sin estado, sin DB). Métodos:

| Método | Descripción |
|--------|-------------|
| `calculate_age()` | Edad en años completos desde fecha de nacimiento |
| `calculate_bmr()` | **Mifflin-St Jeor** por defecto; **Katch-McArdle** si `body_fat_percentage` está presente |
| `calculate_tdee()` | BMR × factor de actividad (5 niveles: 1.2 → 1.9) |
| `calculate_calorie_target()` | TDEE ± ajuste por objetivo (−500 / 0 / +350) |
| `calculate_macros()` | Reparto dinámico: proteína g/kg, grasa %, carbos como resto |
| `compute_full_profile()` | Orquestador que encadena todas las funciones anteriores |

### Backend — Schemas & API (`app/api/metrics.py`)
- `GET /api/metrics/profile`: Perfil calculado al vuelo.
- `POST /api/metrics/onboarding`: Calcula perfil + snapshot inicial (upsert en `daily_metrics`).
- `GET /api/metrics/today_summary`: Agregado de las calorías consumidas y quemadas del día.

---

## 🥗 Módulo de Nutrición e IA Visual (Fase 4)

### Backend — Servicio Vision (`app/services/vision.py`)
- Integra la librería oficial de `openai` para comunicarse de forma asíncrona con GPT-4 Vision (`gpt-4o`).
- Utiliza **Prompt Engineering Estricto** pidiendo a la IA que asuma el rol de un dietista clínico y retorne un `json_object` estricto con las claves: `food`, `weight_g`, `calories`, `protein_g`, `carbs_g`, `fat_g`.

### Backend — API Endpoints (`app/api/meals.py`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/meals/analyze` | Recibe imagen via `UploadFile`, la convierte a base64, la pasa por GPT-4o y retorna el JSON detectado. |
| `POST` | `/api/meals/` | Recibe el JSON validado por el usuario, crea el registro `Meal` y hace un UPSERT en `daily_metrics` sumando calorías y macros. |
| `GET` | `/api/meals/today` | Retorna el historial de comidas del día actual del usuario. |

### Frontend — Flujo de Escaneo y Validación
- Se añadieron `expo-image-picker` y `expo-image-manipulator` para capturar la imagen de la cámara y reducir su peso antes del envío.
- **Validación Humana (`app/(meals)/validation.tsx`)**: Pantalla intermedia crucial para resolver el problema de **ambigüedad monocular** (pérdida de profundidad de la foto). Permite al usuario editar los gramos que calculó la IA; al editar el peso, el frontend recalcula proporcionalmente las calorías y los macros antes de confirmar.
- El Dashboard en el Home y la pantalla de Nutrición ahora recuperan `meals/today` de la API y muestran el cálculo exacto consumido, alimentando los `ProgressRing` y `MacroBars` de forma real.

---

## 🏋️ Entrenador Biomecánico (Fase 5)

### Frontend (Edge AI) — Motor Biomecánico (`biomechanics.ts`)
- Implementación matemática de la **Cinemática Articular**: Uso de álgebra vectorial (`Math.atan2`) para extraer los ángulos internos de la cadera y la rodilla en tiempo real basados en los 33 puntos anatómicos (landmarks) generados por MediaPipe.
- **Detección de Fases (Máquina de Estados)**: Algoritmo que monitorea el cambio (*delta*) en el ángulo de la articulación para diferenciar la fase excéntrica (descenso) de la concéntrica (ascenso) y completar una repetición.
- **Sistema de Prevención de Lesiones**: 
  1. *Knee Valgus* (Colapso de rodillas): Alerta que salta si la distancia horizontal entre las rodillas es 40% menor a la de los tobillos.
  2. *Lumbar Rounding* (Colapso espinal): Penalización al `form_score` si el ángulo de la cadera disminuye más allá del margen seguro en el plano sagital.

### Backend — Cálculo Bioenergético (`workouts.py`)
- Implementación estricta del **Estándar MET** (Metabolic Equivalent of Task).
- Fórmula implementada: `Energía (kcal) = Valor MET × Masa Corporal (kg) × Tiempo (horas)`.
- Diccionario interno que asocia el tipo de ejercicio a un índice MET (ej. Squats pesados = 6.0). 
- Modificación atómica (upsert) en `daily_metrics` para ir incrementando el total de calorías activas quemadas y el tiempo invertido en el día.

---

## 📸 Escáner Corporal y Retroalimentación Metabólica (Fase 6)

### Frontend — Escáner (`scanner.tsx`)
- Interfaz de cámara con guías (siluetas ortogonales) para asegurar la captura ideal frontal o de perfil.
- Subida optimizada de la foto comprimida a través de la API.

### Backend — API de Escaneos (`scans.py`)
- El backend envía la foto a GPT-4 Vision para **estimar la composición del tejido adiposo** (densidad de polígonos/proporciones de silueta) descartando la foto real posteriormente por privacidad.
- **Ciclo Completo**: Al obtener el `% de grasa`, el backend lo inyecta automáticamente en el perfil del usuario.
- **Auto-Transición Metabólica**: Al recalcular el perfil con este nuevo dato, el `MetabolicEngine` **transiciona de la fórmula de Mifflin-St Jeor a la de Katch-McArdle**, sobrescribiendo la tabla `daily_metrics` con el nuevo Gasto Energético Diario Total (TDEE). Esto resuelve el estancamiento en la pérdida de peso al depender ahora de la Masa Corporal Magra.

---

## 🎨 Decisiones Arquitectónicas Globales

1. **JSONB para flexibilidad (PostgreSQL)**: Se utilizaron columnas `JSONB` en tablas clave (`meals.detected_foods`) permitiendo almacenar arreglos de alimentos detectados por IA sin necesidad de subtablas rígidas relacionales.
2. **UUIDs como claves primarias**: Por seguridad y para evitar adivinar la cantidad de registros.
3. **MetabolicEngine puro**: Clase estática 100% testeable independientemente de la base de datos que encapsula el core bioenergético.
4. **Auto-selección de ecuación BMR**: Automática y dinámica (Fases 3 y 6).
5. **IA como Asistente, no como Dictador**: Se fuerza validación humana en la Nutrición y se descartan fotos corporales del disco por razones de privacidad.
6. **Motor Biomecánico Edge (TypeScript)**: Un módulo aislado de matemáticas que funciona de forma local y libre de dependencias nativas pesadas en fase de prototipado.

---

🎉 **EL PROYECTO CORE DE BESTME HA SIDO COMPLETADO.** 🎉
