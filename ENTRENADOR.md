# Entrenador con cámara — estado y puesta en marcha

## Qué hay hoy

| Pieza | Estado |
|---|---|
| Motor biomecánico (`utils/biomechanics.ts`) | ✅ Implementado y **verificado con 18 tests** |
| Adaptador de topologías (`utils/pose.ts`) | ✅ Implementado y testeado |
| Registro manual de series | ✅ Funciona: guarda datos reales y calcula calorías por MET |
| Cámara + detección de pose en vivo | ⬜ Falta: necesita módulos nativos y un dispositivo para validarlo |

### Por qué se eliminó la simulación

La versión anterior de `train.tsx` llamaba a `generateMockSquatFrame(t)`, que genera
coordenadas con una onda seno, y **guardaba esas repeticiones inventadas en la base de
datos como si fueran reales**. El texto "Procesando MediaPipe a 30fps" era decorativo:
no había cámara ni modelo.

Registrar entrenamientos ficticios es peor que no registrar ninguno — contamina el
historial y falsea el balance calórico. Por eso ese camino ya no existe. Mientras la
cámara no esté lista, el entrenador registra a mano, que sí produce datos ciertos.

---

## El motor ya está listo y probado

La parte difícil —las matemáticas— está hecha y verificada:

```bash
cd mobile; npm test
```

Cubre el cálculo de ángulos articulares, el conteo de repeticiones, la detección de
valgo de rodilla y de espalda redondeada, y el aviso de repetición incompleta.

**Un fallo que encontraron estos tests:** el aviso de "poca profundidad" era código
muerto. La máquina de estados exigía bajar de 90° para dar la repetición por válida,
pero el aviso saltaba por encima de 100° — como 90 siempre es menor que 100, la
condición nunca podía cumplirse. Ahora la profundidad decide si la repetición cuenta,
no la transición de fase, y ambas cosas funcionan.

### El detalle que rompe estas integraciones

`biomechanics.ts` se escribió para **BlazePose** (MediaPipe): 33 puntos, cadera
izquierda en el índice 23. **MoveNet** usa la topología **COCO**: 17 puntos, cadera
izquierda en el índice 11.

Indexar una con las constantes de la otra no da error — devuelve otra parte del cuerpo,
y el resultado son ángulos plausibles pero incorrectos. Por eso el motor ya no trabaja
con índices: `utils/pose.ts` traduce ambas topologías a articulaciones con nombre.

Segunda trampa, también cubierta por los tests: **MoveNet emite `[y, x, score]`**, no
`[x, y, score]`. Invertirlos produce ángulos reflejados en la diagonal — otro fallo
silencioso.

---

## Activar la cámara

### 1. Instalar los módulos nativos

```bash
cd mobile; npx expo install react-native-vision-camera react-native-fast-tflite
```

Añade el plugin en `app.json`, dentro de `plugins`:

```json
["react-native-vision-camera", { "enableFrameProcessors": true }]
```

### 2. Descargar el modelo

**MoveNet Lightning** (INT8, ~3 MB) desde Kaggle Models:
<https://www.kaggle.com/models/google/movenet/tfLite/singlepose-lightning>

Guárdalo en `mobile/assets/models/movenet_lightning.tflite`.

> Lightning prioriza velocidad (30+ fps en móvil) sobre precisión, que es lo correcto
> para contar repeticiones en vivo. Thunder es más preciso pero demasiado lento.

### 3. Compilar un Development Build

Estos módulos incluyen código nativo, así que **Expo Go deja de servir** a partir de aquí:

```bash
cd mobile; eas build --platform android --profile development
```

Instala el APK resultante y arranca con `npx expo start --dev-client`.

### 4. Conectar el frame processor

`utils/poseDetector.ts` ya detecta si los módulos están presentes, y `train.tsx` activa
la interfaz de cámara automáticamente cuando lo están. Falta escribir el frame processor
que une las piezas:

```
frame de la cámara
  → redimensionar a 192×192 (lo que espera Lightning)
  → tflite.runSync(input)
  → decodeMoveNetOutput(salida)   ← ya implementado en utils/pose.ts
  → fromMoveNet(keypoints)        ← ya implementado
  → processSquatFrame(pose, estado) ← ya implementado y testeado
```

Es decir: todo lo que va después de la inferencia ya está hecho y probado. Lo que falta
es la captura del frame y la llamada al modelo, que es justamente la parte que **no se
puede validar sin un teléfono**.

### 5. Verificación (requiere dispositivo)

- Haz 5 sentadillas frente a la cámara: el contador debe marcar exactamente 5.
- Junta las rodillas a propósito al bajar: debe saltar el aviso de valgo.
- Haz medias sentadillas: deben contar, y avisar de poca profundidad.
- Comprueba que se mantiene en torno a 30 fps; si no, baja la resolución del frame.

---

## Empezar solo por sentadillas

`biomechanics.ts` implementa la cinemática de la sentadilla, no la de flexiones o peso
muerto. Cada ejercicio necesita sus propios ángulos y umbrales. Conviene validar bien
las sentadillas antes de añadir más movimientos: el registro manual cubre el resto
mientras tanto.
