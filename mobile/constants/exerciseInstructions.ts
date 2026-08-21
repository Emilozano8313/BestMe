/**
 * BestMe — Exercise Instructions
 * =================================
 * How-to text for every exercise the free WorkoutPlanner can recommend
 * (backend/app/services/workout_planner.py's EXERCISE_DATABASE and
 * WARMUP_ROUTINE), plus common alternate names so someone who knows a
 * move by a different label can still recognize it.
 *
 * Purely static content — no backend round-trip needed to show it.
 */

export interface ExerciseInstruction {
  /** Other names this exercise is commonly known by. */
  aka?: string[];
  steps: string[];
}

export const EXERCISE_INSTRUCTIONS: Record<string, ExerciseInstruction> = {
  // ── Legs ──────────────────────────────────────────────────────
  Sentadillas: {
    aka: ['Squats', 'Sentadilla básica'],
    steps: [
      'Pies al ancho de los hombros, punta de los pies ligeramente hacia afuera.',
      'Baja llevando la cadera hacia atrás, como si te sentaras en una silla.',
      'Rodillas alineadas con los pies, sin que se junten hacia adentro.',
      'Baja hasta que los muslos queden paralelos al piso (o lo que tu movilidad permita).',
      'Empuja con los talones para volver arriba.',
    ],
  },
  Zancadas: {
    aka: ['Lunges', 'Estocadas'],
    steps: [
      'De pie, da un paso largo hacia adelante con una pierna.',
      'Baja doblando ambas rodillas a 90°, la rodilla trasera casi toca el piso.',
      'La rodilla delantera no debe pasar la punta del pie.',
      'Empuja con el pie delantero para volver a la posición inicial.',
      'Alterna de pierna en cada repetición.',
    ],
  },
  'Puente de glúteo': {
    aka: ['Glute bridge', 'Hip thrust en el suelo'],
    steps: [
      'Acuéstate boca arriba, rodillas dobladas, pies apoyados cerca de los glúteos.',
      'Empuja con los talones y levanta la cadera hacia el techo.',
      'Aprieta los glúteos arriba, el cuerpo forma una línea recta de rodillas a hombros.',
      'Baja con control sin dejar caer la cadera de golpe.',
    ],
  },
  'Sentadilla búlgara sin peso': {
    aka: ['Bulgarian split squat', 'Sentadilla búlgara'],
    steps: [
      'De espaldas a una silla o banco, apoya el empeine de un pie sobre él.',
      'La otra pierna queda al frente, apoyada en el piso.',
      'Baja doblando la rodilla delantera hasta casi 90°.',
      'Empuja con el talón delantero para subir.',
      'Completa las repeticiones de un lado antes de cambiar de pierna.',
    ],
  },
  'Sentadilla con barra': {
    aka: ['Back squat', 'Sentadilla trasera'],
    steps: [
      'Coloca la barra sobre la espalda alta (trapecio), no sobre el cuello.',
      'Pies al ancho de los hombros, pecho arriba.',
      'Baja controlando la cadera hacia atrás y abajo, rodillas siguiendo la línea de los pies.',
      'Baja hasta paralelo o un poco más, sin perder la espalda recta.',
      'Sube empujando el piso con los pies.',
    ],
  },
  'Prensa de piernas': {
    aka: ['Leg press'],
    steps: [
      'Siéntate en la máquina con los pies al ancho de los hombros sobre la plataforma.',
      'Libera los seguros y baja el peso doblando las rodillas hacia el pecho.',
      'No dejes que la zona lumbar se despegue del respaldo.',
      'Empuja con los talones para extender las piernas sin trabar del todo la rodilla.',
    ],
  },
  'Peso muerto rumano con mancuernas': {
    aka: ['RDL', 'Romanian deadlift', 'Peso muerto rumano'],
    steps: [
      'De pie, mancuernas al frente de los muslos, rodillas con una ligera flexión fija.',
      'Empuja la cadera hacia atrás mientras bajas las mancuernas pegadas a las piernas.',
      'Baja hasta sentir estiramiento en los isquiotibiales, espalda siempre recta.',
      'Regresa empujando la cadera hacia adelante, aprieta los glúteos arriba.',
    ],
  },

  // ── Push: chest, front shoulder, triceps ────────────────────────
  'Flexiones de pecho': {
    aka: ['Push-ups', 'Lagartijas', 'Flexiones'],
    steps: [
      'Manos un poco más anchas que los hombros, cuerpo en línea recta de cabeza a talones.',
      'Baja el pecho hacia el piso doblando los codos a unos 45° del cuerpo.',
      'Baja hasta casi tocar el piso con el pecho.',
      'Empuja para volver arriba sin arquear la espalda baja.',
    ],
  },
  'Fondos en silla': {
    aka: ['Chair dips', 'Tríceps en banco', 'Fondos de tríceps'],
    steps: [
      'Siéntate en el borde de una silla firme, manos junto a las caderas sujetando el borde.',
      'Desliza la cadera hacia adelante, fuera del asiento, piernas extendidas o dobladas.',
      'Baja doblando los codos hacia atrás hasta 90°.',
      'Empuja con los brazos para volver arriba.',
    ],
  },
  'Flexiones diamante': {
    aka: ['Diamond push-ups', 'Flexiones de triángulo'],
    steps: [
      'Igual que una flexión normal, pero junta los pulgares e índices formando un diamante bajo el pecho.',
      'Codos pegados al cuerpo, no hacia los lados.',
      'Baja el pecho hasta casi tocar las manos.',
      'Empuja para subir — trabaja tríceps más que la flexión estándar.',
    ],
  },
  'Press de banca con barra': {
    aka: ['Bench press', 'Press plano'],
    steps: [
      'Acostado en el banco, barra sobre el pecho, agarre un poco más ancho que los hombros.',
      'Baja la barra con control hasta rozar el pecho, codos a unos 45°.',
      'Empuja hacia arriba sin trabar los codos de golpe.',
      'Mantén los pies firmes en el piso y los omóplatos apretados contra el banco.',
    ],
  },
  'Press de pecho con mancuernas': {
    aka: ['Dumbbell bench press'],
    steps: [
      'Acostado en el banco, una mancuerna en cada mano a la altura del pecho.',
      'Empuja las mancuernas hacia arriba hasta casi juntarlas, sin chocarlas.',
      'Baja con control hasta sentir estiramiento en el pecho.',
      'Mantén las muñecas firmes y los codos ligeramente hacia adentro.',
    ],
  },
  'Fondos en paralelas': {
    aka: ['Parallel bar dips', 'Fondos'],
    steps: [
      'Sujeta las barras paralelas, brazos extendidos, cuerpo elevado.',
      'Baja doblando los codos hasta que los hombros queden a la altura de los codos.',
      'Inclina un poco el torso adelante si quieres enfatizar pecho.',
      'Empuja para subir sin trabar los codos violentamente.',
    ],
  },

  // ── Pull: back, biceps ───────────────────────────────────────────
  'Remo invertido en mesa': {
    aka: ['Inverted row', 'Remo australiano'],
    steps: [
      'Acuéstate bajo una mesa firme o barra baja, sujétala con ambas manos.',
      'Cuerpo recto, talones apoyados en el piso, cuelga con los brazos extendidos.',
      'Jala el pecho hacia la barra apretando los omóplatos.',
      'Baja con control sin dejar caer la cadera.',
    ],
  },
  Superman: {
    aka: ['Extensión lumbar', 'Superman hold'],
    steps: [
      'Acuéstate boca abajo, brazos extendidos al frente.',
      'Levanta al mismo tiempo brazos, pecho y piernas del piso.',
      'Aprieta la espalda baja y los glúteos arriba, sin forzar el cuello.',
      'Sostén un momento y baja con control.',
    ],
  },
  'Buenos días sin peso': {
    aka: ['Good mornings', 'Buenos días'],
    steps: [
      'De pie, manos detrás de la cabeza o cruzadas al pecho.',
      'Con las rodillas ligeramente flexionadas, empuja la cadera hacia atrás e inclina el torso al frente.',
      'Baja hasta sentir estiramiento en isquiotibiales, espalda siempre recta.',
      'Vuelve arriba empujando la cadera hacia adelante.',
    ],
  },
  Dominadas: {
    aka: ['Pull-ups', 'Chin-ups (agarre supino)'],
    steps: [
      'Sujeta la barra con las manos un poco más anchas que los hombros.',
      'Cuelga con los brazos extendidos, cuerpo estable sin balancearte.',
      'Jala hacia arriba hasta que la barbilla pase la barra.',
      'Baja con control hasta extender los brazos por completo.',
    ],
  },
  'Remo con barra': {
    aka: ['Barbell row', 'Remo con barra inclinado'],
    steps: [
      'De pie, inclina el torso hacia adelante manteniendo la espalda recta.',
      'Sujeta la barra con las manos al ancho de los hombros, brazos extendidos.',
      'Jala la barra hacia el abdomen apretando los omóplatos.',
      'Baja con control sin redondear la espalda.',
    ],
  },
  'Jalón al pecho': {
    aka: ['Lat pulldown', 'Polea al pecho'],
    steps: [
      'Siéntate en la máquina, sujeta la barra más ancho que los hombros.',
      'Jala la barra hacia la parte alta del pecho, sacando pecho y apretando omóplatos.',
      'Evita usar el impulso del cuerpo hacia atrás.',
      'Sube con control hasta extender los brazos.',
    ],
  },
  'Remo con mancuerna a una mano': {
    aka: ['One-arm dumbbell row', 'Remo unilateral'],
    steps: [
      'Apoya una rodilla y una mano en un banco, espalda paralela al piso.',
      'Sujeta la mancuerna con la mano libre, brazo extendido.',
      'Jala la mancuerna hacia la cadera apretando el omóplato.',
      'Baja con control y repite; luego cambia de lado.',
    ],
  },

  // ── Shoulders ─────────────────────────────────────────────────────
  'Flexiones pike': {
    aka: ['Pike push-up'],
    steps: [
      'En posición de flexión, eleva la cadera formando una "V" invertida.',
      'Manos y pies formando un triángulo con la cadera arriba.',
      'Baja la cabeza hacia el piso doblando los codos, mirando hacia los pies.',
      'Empuja para volver arriba — trabaja el hombro más que el pecho.',
    ],
  },
  'Flexiones pike con pies elevados': {
    aka: ['Elevated pike push-up'],
    steps: [
      'Igual que la flexión pike, pero con los pies apoyados sobre una silla o escalón.',
      'Cadera bien elevada, cuerpo casi vertical.',
      'Baja la cabeza hacia el piso doblando los codos.',
      'Empuja para subir — variante más intensa para hombro.',
    ],
  },
  'Plancha con toques de hombro': {
    aka: ['Plank shoulder taps'],
    steps: [
      'Posición de plancha alta, manos bajo los hombros, cuerpo recto.',
      'Sin mover la cadera, lleva una mano a tocar el hombro contrario.',
      'Vuelve a apoyar la mano y repite con la otra.',
      'Mantén la cadera estable: es un ejercicio de estabilidad de hombro.',
    ],
  },
  'Press militar con barra': {
    aka: ['Overhead press', 'Military press'],
    steps: [
      'De pie, barra a la altura de los hombros, agarre al ancho de hombros.',
      'Empuja la barra hacia arriba hasta extender los brazos por completo.',
      'Mantén el abdomen firme para no arquear la espalda baja.',
      'Baja con control hasta la posición inicial.',
    ],
  },
  'Elevaciones laterales con mancuernas': {
    aka: ['Lateral raises'],
    steps: [
      'De pie, una mancuerna en cada mano a los costados, codos con ligera flexión.',
      'Eleva los brazos hacia los lados hasta la altura de los hombros.',
      'No uses impulso: el movimiento lo hace el hombro, no la espalda.',
      'Baja con control.',
    ],
  },

  // ── Core ──────────────────────────────────────────────────────────
  'Plancha abdominal': {
    aka: ['Plank'],
    steps: [
      'Antebrazos en el piso, codos bajo los hombros.',
      'Cuerpo en línea recta de cabeza a talones, sin subir ni bajar la cadera.',
      'Aprieta abdomen y glúteos, respira normal.',
      'Sostén la posición por el tiempo indicado.',
    ],
  },
  'Abdominales bicicleta': {
    aka: ['Bicycle crunches'],
    steps: [
      'Acuéstate boca arriba, manos detrás de la cabeza, piernas elevadas y dobladas.',
      'Lleva el codo hacia la rodilla contraria mientras extiendes la otra pierna.',
      'Alterna de lado en un movimiento de "pedaleo" controlado.',
      'Evita jalar el cuello con las manos.',
    ],
  },
  'Elevación de piernas': {
    aka: ['Leg raises'],
    steps: [
      'Acuéstate boca arriba, manos a los lados o bajo los glúteos.',
      'Piernas extendidas, elévalas hasta formar 90° con el piso.',
      'Baja con control sin dejarlas caer, sin despegar la zona lumbar del piso.',
      'Repite sin dejar que los pies toquen el piso entre repeticiones.',
    ],
  },
  'Plancha lateral': {
    aka: ['Side plank'],
    steps: [
      'Acuéstate de lado, apóyate en un antebrazo, codo bajo el hombro.',
      'Eleva la cadera hasta formar una línea recta de cabeza a pies.',
      'Aprieta el abdomen, no dejes que la cadera caiga.',
      'Sostén el tiempo indicado y repite del otro lado.',
    ],
  },
  'Rueda abdominal': {
    aka: ['Ab wheel rollout'],
    steps: [
      'De rodillas, sujeta la rueda con ambas manos frente a ti.',
      'Rueda hacia adelante extendiendo el cuerpo, manteniendo el abdomen firme.',
      'Llega hasta donde puedas controlar sin que la espalda baja se hunda.',
      'Vuelve a la posición inicial contrayendo el abdomen, no jalando con los brazos.',
    ],
  },

  // ── Full body / conditioning finisher ──────────────────────────────
  Burpees: {
    steps: [
      'De pie, baja a sentadilla y apoya las manos en el piso.',
      'Salta con los pies hacia atrás quedando en posición de plancha.',
      'Haz una flexión (opcional), luego salta los pies de vuelta hacia las manos.',
      'Salta hacia arriba extendiendo los brazos por encima de la cabeza.',
    ],
  },
  Escaladores: {
    aka: ['Mountain climbers'],
    steps: [
      'Posición de plancha alta, manos bajo los hombros.',
      'Lleva una rodilla hacia el pecho sin levantar la cadera.',
      'Cambia de pierna rápidamente, como si corrieras en el lugar.',
      'Mantén el abdomen firme durante todo el movimiento.',
    ],
  },
  'Sentadilla con salto': {
    aka: ['Jump squat'],
    steps: [
      'Baja a una sentadilla normal.',
      'Impúlsate con fuerza hacia arriba, despegando los pies del piso.',
      'Aterriza suave, doblando las rodillas para amortiguar.',
      'Baja de nuevo a la sentadilla y repite.',
    ],
  },
  'Swings con kettlebell': {
    aka: ['Kettlebell swing'],
    steps: [
      'De pie, pies al ancho de los hombros, kettlebell con ambas manos al frente.',
      'Empuja la cadera hacia atrás bajando el kettlebell entre las piernas.',
      'Extiende la cadera con fuerza para impulsar el kettlebell hasta la altura del pecho.',
      'El movimiento lo genera la cadera, no los brazos ni la espalda baja.',
    ],
  },
  'Remo en máquina (cardio)': {
    aka: ['Rowing machine'],
    steps: [
      'Siéntate, pies sujetos, sujeta el mango con los brazos extendidos.',
      'Empuja con las piernas primero, luego inclina el torso hacia atrás y jala el mango al pecho.',
      'Vuelve en el orden inverso: brazos, torso, piernas.',
      'Mantén un ritmo constante en vez de tirones bruscos.',
    ],
  },

  // ── Calentamiento ────────────────────────────────────────────────
  'Marcha en el sitio': {
    steps: [
      'De pie, levanta las rodillas alternadamente como si marcharas.',
      'Balancea los brazos con naturalidad.',
      'Mantén un ritmo cómodo para elevar el pulso poco a poco.',
    ],
  },
  'Círculos de brazos': {
    steps: [
      'De pie, brazos extendidos a los lados.',
      'Haz círculos pequeños que van creciendo, hacia adelante.',
      'Después de la mitad del tiempo, invierte la dirección hacia atrás.',
    ],
  },
  'Rotación de cadera y tobillos': {
    steps: [
      'Manos en la cintura, haz círculos amplios con la cadera hacia un lado y luego el otro.',
      'Luego, apoyado en algo si necesitas balance, rota cada tobillo en ambas direcciones.',
    ],
  },
  'Sentadillas sin peso': {
    steps: [
      'Sentadilla normal pero lenta y controlada, sin prisa.',
      'Baja hasta donde tu movilidad lo permita cómodamente.',
      'El objetivo es activar la cadera y rodilla, no la intensidad.',
    ],
  },
  'Zancadas dinámicas': {
    steps: [
      'Da un paso al frente en zancada, sube, y regresa al centro.',
      'Alterna de pierna en cada repetición, con movimiento continuo (no sostengas la posición).',
      'Mantén el torso erguido durante todo el movimiento.',
    ],
  },
};
