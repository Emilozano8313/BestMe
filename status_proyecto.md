# 📋 BestMe — Status del Proyecto

> **Última actualización:** 2026-08-15
> **Versión:** 0.5.0
> **Estado:** Backend funcional y verificado · Frontend conectado a datos reales · Rutinas gratuitas sin IA · Falta cámara real e IA con clave

---

## 🏗️ Estado General

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend (FastAPI) | ✅ Funcional | 20 endpoints, arranca en Windows y en Docker |
| Base de Datos (PostgreSQL) | ✅ 2 migraciones | Tipos portables: los tests corren en SQLite |
| Autenticación | ✅ Funcional | JWT + refresh automático, sesión persistente |
| Rutinas de entrenamiento (`WorkoutPlanner`) | ✅ Funcional, gratis | Motor de reglas, sin llamada a Claude — funciona sin `ANTHROPIC_API_KEY` |
| Motor Metabólico | ✅ Funcional | Mifflin-St Jeor ⇄ Katch-McArdle verificado |
| Nutrición IA | ⚠️ Falta la clave | Código listo (Claude Sonnet 5); sin `ANTHROPIC_API_KEY` devuelve datos de ejemplo marcados |
| Escáner Corporal | ⚠️ Falta la clave | Igual que arriba. Flujo de confirmación implementado |
| Entrenador Biomecánico | ❌ **Simulado** | `train.tsx` genera landmarks falsos. No hay cámara ni modelo de pose |
| Tests | ✅ 57 pasando | Antes 3 de 4 archivos ni siquiera arrancaban |
| Despliegue en la nube | ⬜ Pendiente | Config endurecida; falta desplegar |

---

## 🔧 Correcciones aplicadas (2026-08-15)

La versión anterior de este documento declaraba el proyecto "completado". No lo estaba:
la app no funcionaba de extremo a extremo. Estos fallos impedían usarla.

### El servidor no arrancaba

1. **`MealUpdate` no existía.** `app/api/meals.py` lo importaba de `app/schemas/meal.py`,
   donde nunca se definió. `app.main` fallaba al importarse → el backend no levantaba.
2. **Emojis en el arranque.** Los `print()` con emoji reventaban la consola de Windows
   (`UnicodeEncodeError`, cp1252). Sustituidos por `logging`.

### Los datos no se guardaban

3. **Enums invertidos.** SQLAlchemy persiste el *nombre* del miembro (`"MALE"`), pero la
   migración 0001 creó los tipos de PostgreSQL con los *valores* (`'male'`). Fallaba todo
   INSERT con género, nivel de actividad, objetivo o tipo de comida — es decir, el registro,
   el onboarding y guardar cualquier comida. Resuelto con `values_callable`.
4. **Colisión de columnas.** `daily_metrics.protein_g/carbs_g/fat_g` se usaban a la vez
   como macros *consumidos* (meals.py) y *objetivo* (scans.py). Escanear el cuerpo borraba
   el registro de comida del día. Se añaden columnas `target_*` (migración 0002, con
   reparación de datos existentes).

### El frontend

5. **`index.tsx` usaba `api` sin importarlo** → `ReferenceError` al abrir la pantalla Home.
6. **El cliente API ignoraba `response.ok`** → un 500 se propagaba como éxito. La pantalla
   de validación decía "guardado" para comidas que nunca llegaron a la base de datos.
7. **La sesión no persistía** (había un `setTimeout` simulado). Ahora usa `expo-secure-store`
   y renueva el token automáticamente ante un 401.
8. **`localhost:8000` fijado en 3 sitios** → desde un teléfono físico apunta al propio
   teléfono. Ahora sale de `EXPO_PUBLIC_API_URL`.
9. **Perfil con datos inventados** ("Carlos Mendoza, 82.5 kg"). Conectado al usuario real.
10. **Pestaña fantasma**: `training.tsx` era una pantalla mock huérfana que expo-router
    registraba igualmente como quinta pestaña. Eliminada.

### Otros

- El escaneo corporal se divide en `/analyze` (previsualiza) y `/confirm` (aplica): la IA
  ya no reescribe tu TDEE sin que lo confirmes, y avisa cuando la confianza es baja.
- Las sesiones de entrenamiento se guardaban siempre con duración cero (`started_at = ended_at`).
- Los errores devolvían `str(e)` al cliente, filtrando trazas internas.
- CORS con credenciales ya no se combina con origen comodín (el navegador lo rechaza).
- `validate_for_production()` aborta el arranque si en producción siguen la clave JWT por
  defecto, CORS en comodín o `DEBUG` activo.
- Validación de tamaño (8 MB) y formato en las subidas de imagen.
- TypeScript: de 20 errores a 0.

---

## 🤖 Módulo de IA Visual

Migrado de OpenAI GPT-4o a **Claude Sonnet 5** con *structured outputs*.

El código anterior hacía `json.loads()` y comprobaba a mano si existía la clave `foods`;
si el modelo devolvía otra forma, reventaba. Ahora el esquema JSON lo **garantiza la API**,
así que esa clase de error desaparece por construcción. Sonnet 5 admite además imágenes de
mayor resolución (2576 px frente a 1536), lo que importa al estimar porciones.

Cada alimento incluye un campo `confidence`: la app resalta las porciones poco fiables
para que sepas cuáles conviene revisar.

**Sin `ANTHROPIC_API_KEY` la app funciona igual, pero los análisis devuelven datos de
ejemplo claramente marcados** (`is_mock: true`, nombres con `[EJEMPLO]`, confianza 0).

---

## 🏋️ Rutinas de entrenamiento — gratis, sin IA de pago

`GET /api/workouts/plan?location=home|gym` genera una sesión equilibrada a partir del
perfil que ya tienes guardado (objetivo, nivel de actividad, peso) — **no llama a Claude
ni a ningún servicio de pago**. Es un motor de reglas (`WorkoutPlanner`), igual de
determinista que el `MetabolicEngine` que calcula tus calorías, con 68 tests propios.

- Selecciona un ejercicio por grupo muscular (piernas, empuje, tirón, hombros, core, y un
  extra de cuerpo completo si tu actividad es alta), filtrando por el equipo disponible:
  en casa solo peso corporal, en el gym también mancuernas/barra/máquina/polea.
- Series, repeticiones y descanso se ajustan a tu objetivo (perder grasa → más reps,
  menos descanso, más un remate de cardio; ganar músculo → menos reps, más descanso).
- La rotación diaria usa la fecha como semilla, así que el ejercicio de cada grupo puede
  variar de un día a otro sin guardar ningún estado.
- Estima duración y calorías (MET 5.0 × tu peso), coherente con el resto de la app.

Card "Tu rutina de hoy" en la pantalla Entrenar, con selector Casa/Gym.

Coste estimado: ~1 céntimo de dólar por foto (~US$1,5/mes con 5 comidas diarias).

---

## ✅ Verificación

**Backend — 57 tests:**

```bash
cd backend; python -m pytest -v
```

**Recorrido completo contra un servidor real (18/18 comprobaciones):** registro con género →
login → onboarding → analizar comida → guardar comida → resumen del día → escaneo corporal
(previsualizar, luego confirmar) → transición a Katch-McArdle → verificar que la comida
sigue intacta → entrenamiento con MET y duración real → renovación de token.

**Migraciones:** el SQL generado se valida contra la gramática real de PostgreSQL (`pglast`).

**Frontend:**

```bash
cd mobile; npx tsc --noEmit
```

---

## 🚧 Lo que falta

### 1. Entrenador biomecánico con cámara real — el bloque más grande

`app/(tabs)/train.tsx` **no usa la cámara**: llama a `generateMockSquatFrame(t)`, que genera
coordenadas con una onda seno. El texto "Procesando MediaPipe a 30fps" es decorativo.

La matemática de `utils/biomechanics.ts` (ángulos articulares, máquina de estados para contar
repeticiones, detección de valgo de rodilla) **sí es correcta** — simplemente nunca ha visto
un cuerpo real.

Plan: `react-native-vision-camera` + `react-native-fast-tflite` + **MoveNet Lightning**.
Ojo: `biomechanics.ts` usa índices de BlazePose (33 puntos, cadera = 23); MoveNet usa COCO
(17 puntos, cadera = 11), así que hace falta una capa adaptadora. Requiere Development Build
— a partir de ahí Expo Go deja de servir.

### 2. Clave de IA

Añadir `ANTHROPIC_API_KEY` en `backend/.env` (se obtiene en console.anthropic.com).
Sin ella los análisis son datos de ejemplo.

### 3. Despliegue en la nube

La configuración ya está endurecida. Falta: `Dockerfile` de producción (quitar `--reload`,
usar gunicorn), rate limiting en los endpoints de IA, y desplegar (Railway recomendado).

### 4. Funcionalidad para que sea una app terminada

- **Historial y gráficas** — `GET /meals/history` existe pero ninguna pantalla lo usa. Sin
  tendencias, la app no cumple del todo su objetivo de *controlar* el consumo.
- **Registro de peso diario** — la columna existe y el perfil ya permite actualizarlo, pero
  no hay seguimiento histórico, así que el motor metabólico no se adapta al progreso.
- **Código de barras** — mucho más preciso que una foto para productos envasados.
- **Base de alimentos frecuentes** — evitaría una llamada a la IA por cada comida repetida.
- **Modo offline** y **notificaciones**.
