/**
 * BestMe — Biomechanical Coach (Train Screen)
 * ============================================
 * Simulates a real-time Edge AI camera feed analyzing squats.
 * Connects to the biomechanics engine for kinematics and triggers alerts.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { BiomechanicsState, processSquatFrame, generateMockSquatFrame } from '@/utils/biomechanics';
import api from '@/services/api';

export default function TrainScreen() {
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  
  const [bioState, setBioState] = useState<BiomechanicsState>({
    reps: 0,
    phase: 'standing',
    formScore: 1.0,
    issues: [],
    lastHipAngle: 180,
    lastKneeAngle: 180,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const frameLoopRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // ── Session Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // ── Edge AI Simulation Loop (30 fps) ──────────────────────────
  useEffect(() => {
    let animationFrameId: number;
    let t = 0; // Time parameter for the squat sine wave
    let direction = 1;

    const loop = () => {
      if (isActive) {
        // Generate mock landmarks
        const landmarks = generateMockSquatFrame(t);
        
        // Process them through the Kinematics engine
        setBioState((prevState) => processSquatFrame(landmarks, prevState));

        // Advance the sine wave slowly (simulates 1 rep every 4 seconds)
        t += 0.01 * direction;
        if (t >= 1) {
          t = 1;
          direction = -1;
        } else if (t <= 0) {
          t = 0;
          direction = 1;
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isActive) {
      loop();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive]);

  // ── Handlers ──────────────────────────────────────────────────
  const toggleWorkout = () => {
    if (!isActive && bioState.reps > 0) {
      // If stopped and we have reps, we should save it, not resume
      return;
    }
    setIsActive(!isActive);
  };

  const finishWorkout = async () => {
    setIsActive(false);
    
    if (bioState.reps === 0) {
      Alert.alert('Entrenamiento vacío', 'No completaste ninguna repetición.');
      return;
    }

    try {
      setIsSaving(true);
      
      const payload = {
        exercise_name: 'squat',
        total_reps: bioState.reps,
        duration_seconds: sessionDuration,
        analysis_summary: { issues: Array.from(new Set(bioState.issues)) }, // unique issues
        sets: [
          {
            set_number: 1,
            reps: bioState.reps,
            weight_kg: 0, // bodyweight
            form_score: bioState.formScore,
            issues: Array.from(new Set(bioState.issues)),
          }
        ]
      };

      const res = await api.post('/workouts/', payload);

      if (res.error) throw new Error(res.error);

      Alert.alert(
        '¡Sesión Guardada!', 
        `Quemaste ${Math.round(res.data.calories_burned)} kcal.\nTu técnica fue del ${Math.round(bioState.formScore * 100)}%.`
      );

      // Reset
      setBioState({ reps: 0, phase: 'standing', formScore: 1.0, issues: [], lastHipAngle: 180, lastKneeAngle: 180 });
      setSessionDuration(0);
      
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render Helpers ────────────────────────────────────────────
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentIssues = Array.from(new Set(bioState.issues));
  const hasAlerts = isActive && currentIssues.length > 0;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.gradient}>
        
        {/* Mock Camera Viewfinder */}
        <View style={styles.cameraContainer}>
          {isActive ? (
            <View style={styles.cameraActive}>
              <Ionicons name="scan-outline" size={80} color="rgba(16, 185, 129, 0.3)" />
              <Text style={styles.aiText}>Procesando MediaPipe a 30fps...</Text>
              
              {/* Dynamic Overlay Phase Indicator */}
              <View style={styles.phaseIndicator}>
                <Text style={styles.phaseText}>Fase: {bioState.phase.toUpperCase()}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.cameraIdle}>
              <Ionicons name="videocam-outline" size={60} color={palette.gray500} />
              <Text style={styles.idleText}>Cámara lista. Toca Iniciar.</Text>
            </View>
          )}

          {/* Injury Prevention Alerts */}
          {hasAlerts && (
            <View style={styles.alertOverlay}>
              <Ionicons name="warning-outline" size={24} color={palette.coral} />
              <View style={{ marginLeft: 8 }}>
                {currentIssues.includes('lumbar_rounding') && <Text style={styles.alertText}>¡Cuidado con la espalda baja!</Text>}
                {currentIssues.includes('knee_valgus') && <Text style={styles.alertText}>¡Evita que las rodillas colapsen!</Text>}
              </View>
            </View>
          )}
        </View>

        {/* Real-time HUD */}
        <View style={styles.hud}>
          <GlassCard style={styles.hudCard} variant={isActive ? 'highlight' : 'default'}>
            <Text style={styles.hudLabel}>REPS</Text>
            <Text style={styles.hudValue}>{bioState.reps}</Text>
          </GlassCard>

          <GlassCard style={styles.hudCard}>
            <Text style={styles.hudLabel}>TÉCNICA</Text>
            <Text style={[styles.hudValue, { color: bioState.formScore > 0.8 ? palette.emerald : palette.amber }]}>
              {Math.round(bioState.formScore * 100)}%
            </Text>
          </GlassCard>

          <GlassCard style={styles.hudCard}>
            <Text style={styles.hudLabel}>TIEMPO</Text>
            <Text style={styles.hudValue}>{formatTime(sessionDuration)}</Text>
          </GlassCard>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {!isActive && bioState.reps === 0 && (
            <Pressable style={styles.mainBtn} onPress={toggleWorkout}>
              <LinearGradient colors={[palette.emerald, palette.cyan]} style={styles.btnGradient}>
                <Ionicons name="play" size={24} color={palette.white} />
                <Text style={styles.btnText}>Iniciar Sentadillas</Text>
              </LinearGradient>
            </Pressable>
          )}

          {isActive && (
            <Pressable style={styles.mainBtn} onPress={toggleWorkout}>
              <LinearGradient colors={[palette.coral, '#ff4757']} style={styles.btnGradient}>
                <Ionicons name="stop" size={24} color={palette.white} />
                <Text style={styles.btnText}>Pausar</Text>
              </LinearGradient>
            </Pressable>
          )}

          {!isActive && bioState.reps > 0 && (
            <Pressable style={styles.mainBtn} onPress={finishWorkout} disabled={isSaving}>
              <LinearGradient colors={[palette.emerald, palette.cyan]} style={styles.btnGradient}>
                {isSaving ? <ActivityIndicator color={palette.white} /> : (
                  <>
                    <Ionicons name="checkmark-done" size={24} color={palette.white} />
                    <Text style={styles.btnText}>Guardar Sesión</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}
        </View>

      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gradient: { flex: 1, paddingTop: 60, paddingHorizontal: Spacing.lg },
  
  cameraContainer: {
    flex: 1,
    backgroundColor: palette.dark900,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  cameraIdle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  idleText: { color: palette.gray400, marginTop: Spacing.sm },
  
  cameraActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0f18',
  },
  aiText: {
    color: palette.emerald,
    marginTop: Spacing.md,
    fontSize: Typography.size.sm,
    opacity: 0.8,
  },
  phaseIndicator: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  phaseText: { color: palette.cyan, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },

  alertOverlay: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  alertText: { color: palette.white, fontWeight: Typography.weight.bold, fontSize: Typography.size.sm },

  hud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  hudCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  hudLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    marginBottom: 4,
  },
  hudValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },

  controls: {
    marginBottom: Spacing['4xl'],
  },
  mainBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  btnText: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
});
