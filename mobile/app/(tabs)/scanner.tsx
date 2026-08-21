/**
 * BestMe — Body Scanner
 * =======================
 * Captures an orthogonal full-body photo, previews the AI's body-fat
 * estimate, and only applies it once the user confirms.
 *
 * The confirmation step is deliberate: accepting an estimate rewrites the
 * user's body fat percentage, which switches the metabolic engine to
 * Katch-McArdle and changes their calorie target for every day that follows.
 * A photo-based estimate carries a several-point margin of error, so it
 * should never do that silently.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COUNTDOWN_SECONDS = 6;

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

interface ScanPreview {
  estimated_body_fat: number;
  confidence_score: number;
  notes: string;
  limiting_factors: string[];
  is_reliable: boolean;
  is_mock: boolean;
  projected_bmr: number | null;
  projected_tdee: number | null;
  projected_calorie_target: number | null;
  projected_equation: string | null;
}

interface ScanConfirmed {
  estimated_body_fat: number;
  new_tdee: number;
  new_bmr: number;
  new_calorie_target: number;
  equation_used: string;
}

const EQUATION_LABELS: Record<string, string> = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  katch_mcardle: 'Katch-McArdle',
};

export default function ScannerScreen() {
  const { refreshMetabolicProfile } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [countdown, setCountdown] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [confirmed, setConfirmed] = useState<ScanConfirmed | null>(null);
  const [bodyFatDraft, setBodyFatDraft] = useState('');

  const handleReset = useCallback(() => {
    setImageUri(null);
    setPreview(null);
    setConfirmed(null);
    setBodyFatDraft('');
    setCountdown(null);
  }, []);

  const processImage = useCallback(async (uri: string) => {
    setIsAnalyzing(true);
    setPreview(null);
    setConfirmed(null);
    setImageUri(uri);

    try {
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { height: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );

      const response = await api.uploadImage<ScanPreview>('/scans/analyze', resized.uri);
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Error en el escaneo');
      }

      setPreview(response.data);
      setBodyFatDraft(String(response.data.estimated_body_fat));
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo analizar la foto.');
      setImageUri(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleShutter = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        await processImage(photo.uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo tomar la foto. Intenta de nuevo.');
    }
  }, [processImage]);

  // Self-timer: lets you prop the phone up and step back into the silhouette
  // before the shutter fires, instead of holding it yourself.
  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      void handleShutter();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, handleShutter]);

  const handleConfirm = useCallback(async () => {
    if (!preview) return;

    const parsed = parseFloat(bodyFatDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 2 || parsed >= 70) {
      Alert.alert('Valor no válido', 'Introduce un porcentaje entre 2 y 70.');
      return;
    }

    setIsConfirming(true);
    try {
      const response = await api.post<ScanConfirmed>('/scans/confirm', {
        estimated_body_fat: parsed,
        confidence_score: preview.confidence_score,
        notes: preview.notes,
      });

      if (response.error || !response.data) {
        throw new Error(response.error ?? 'No se pudo guardar el escaneo');
      }

      setConfirmed(response.data);
      setPreview(null);
      await refreshMetabolicProfile();
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo guardar el escaneo.');
    } finally {
      setIsConfirming(false);
    }
  }, [preview, bodyFatDraft, refreshMetabolicProfile]);

  const confidencePercent = preview ? Math.round(preview.confidence_score * 100) : 0;
  const confidenceColor = !preview
    ? palette.gray400
    : preview.confidence_score >= 0.6
      ? palette.emerald
      : preview.confidence_score >= 0.35
        ? palette.amber
        : palette.coral;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Escáner Corporal</Text>
            <Text style={styles.subtitle}>
              Estima tu % de grasa y recalibra tu metabolismo.
            </Text>
          </View>

          {/* Camera area / preview image — fills the screen while framing,
              settles to a fixed height once there's a result to scroll past. */}
          <View
            style={[
              styles.cameraContainer,
              { height: imageUri ? 420 : Math.max(420, windowHeight - 340) },
            ]}
          >
            {!imageUri ? (
              !permission ? (
                <View style={styles.placeholderBox} />
              ) : !permission.granted ? (
                <View style={styles.placeholderBox}>
                  <Ionicons name="camera-outline" size={40} color={palette.gray400} />
                  <Text style={styles.instructionText}>
                    BestMe necesita acceso a la cámara para el escáner corporal.
                  </Text>
                  <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Permitir cámara</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={StyleSheet.absoluteFill}>
                  <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

                  {/* Silhouette guide, overlaid on the live feed */}
                  <View style={styles.silhouetteOverlay} pointerEvents="none">
                    <View style={styles.silhouetteContainer}>
                      <View style={styles.silhouetteHead} />
                      <View style={styles.silhouetteBody} />
                      <View style={styles.silhouetteLegs} />
                    </View>
                  </View>

                  {countdown !== null ? (
                    <View style={styles.countdownOverlay} pointerEvents="none">
                      <Text style={styles.countdownText}>{countdown}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.instructionTextOverlay}>
                    Alinea tu cuerpo con la silueta. Apoya el teléfono, inicia el
                    autodisparador y da unos pasos atrás.
                  </Text>

                  <View style={styles.cameraControls}>
                    <Pressable
                      style={styles.flipBtn}
                      onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                    >
                      <Ionicons name="camera-reverse-outline" size={22} color={palette.white} />
                    </Pressable>

                    <Pressable
                      style={styles.captureBtn}
                      onPress={countdown === null ? startCountdown : () => setCountdown(null)}
                    >
                      {countdown !== null ? (
                        <Ionicons name="close" size={30} color={palette.dark900} />
                      ) : (
                        <Ionicons name="timer-outline" size={30} color={palette.dark900} />
                      )}
                    </Pressable>

                    <Pressable style={styles.flipBtn} onPress={handleShutter}>
                      <Ionicons name="camera" size={22} color={palette.white} />
                    </Pressable>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.imageBox}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                {isAnalyzing ? (
                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="large" color={palette.emerald} />
                    <Text style={styles.analyzingText}>Analizando composición...</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* Privacy note */}
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={13} color={palette.gray400} />
            <Text style={styles.privacyText}>
              La foto se analiza y se descarta: nunca se guarda en el servidor.
            </Text>
          </View>

          {/* ── Preview (not yet applied) ──────────────── */}
          {preview ? (
            <GlassCard style={styles.resultCard} variant="highlight">
              <View style={styles.resultHeader}>
                <Ionicons name="eyedrop-outline" size={22} color={palette.cyan} />
                <Text style={styles.resultTitle}>Estimación preliminar</Text>
              </View>

              {preview.is_mock ? (
                <View style={[styles.warningBox, { backgroundColor: 'rgba(255,179,64,0.10)' }]}>
                  <Ionicons name="flask-outline" size={16} color={palette.amber} />
                  <Text style={[styles.warningText, { color: palette.amber }]}>
                    Datos de ejemplo: falta configurar la clave de IA en el servidor.
                    No uses este resultado.
                  </Text>
                </View>
              ) : null}

              <View style={styles.resultGrid}>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Grasa estimada</Text>
                  <Text style={styles.resultValue}>{preview.estimated_body_fat}%</Text>
                </View>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Confianza</Text>
                  <Text style={[styles.resultValue, { color: confidenceColor }]}>
                    {confidencePercent}%
                  </Text>
                </View>
              </View>

              {!preview.is_reliable && !preview.is_mock ? (
                <View style={styles.warningBox}>
                  <Ionicons name="warning-outline" size={16} color={palette.coral} />
                  <Text style={styles.warningText}>
                    Confianza baja. Repite la foto con mejor luz y ropa ajustada, o
                    corrige el valor a mano si conoces tu porcentaje real.
                  </Text>
                </View>
              ) : null}

              {preview.notes ? <Text style={styles.notesText}>{preview.notes}</Text> : null}

              {preview.limiting_factors.length > 0 ? (
                <View style={styles.factorsRow}>
                  {preview.limiting_factors.map((factor) => (
                    <View key={factor} style={styles.factorChip}>
                      <Text style={styles.factorChipText}>{factor}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Editable value — the user has the final word. */}
              <Text style={styles.adjustLabel}>Ajusta si lo ves necesario (%)</Text>
              <TextInput
                style={styles.adjustInput}
                value={bodyFatDraft}
                onChangeText={setBodyFatDraft}
                keyboardType="decimal-pad"
                placeholder="18.5"
                placeholderTextColor={palette.gray500}
              />

              {preview.projected_calorie_target ? (
                <View style={styles.projectionBox}>
                  <Text style={styles.projectionTitle}>Si lo aceptas:</Text>
                  <Text style={styles.projectionDesc}>
                    La ecuación pasará a{' '}
                    <Text style={{ color: palette.cyan, fontWeight: 'bold' }}>
                      {EQUATION_LABELS[preview.projected_equation ?? ''] ??
                        preview.projected_equation}
                    </Text>{' '}
                    y tu objetivo diario será de{' '}
                    <Text style={{ color: palette.amber, fontWeight: 'bold' }}>
                      {Math.round(preview.projected_calorie_target)} kcal
                    </Text>
                    .
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={styles.confirmBtn}
                onPress={handleConfirm}
                disabled={isConfirming}
              >
                <LinearGradient
                  colors={[palette.emerald, palette.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmGradient}
                >
                  {isConfirming ? (
                    <ActivityIndicator color={palette.white} />
                  ) : (
                    <>
                      <Text style={styles.confirmText}>Aplicar a mi perfil</Text>
                      <Ionicons name="checkmark-circle-outline" size={22} color={palette.white} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Descartar y repetir</Text>
              </Pressable>
            </GlassCard>
          ) : null}

          {/* ── Confirmed ──────────────────────────────── */}
          {confirmed ? (
            <GlassCard style={styles.resultCard} variant="highlight">
              <View style={styles.resultHeader}>
                <Ionicons name="checkmark-circle" size={24} color={palette.emerald} />
                <Text style={styles.resultTitle}>Perfil actualizado</Text>
              </View>

              <View style={styles.resultGrid}>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Grasa corporal</Text>
                  <Text style={styles.resultValue}>{confirmed.estimated_body_fat}%</Text>
                </View>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Nuevo TDEE</Text>
                  <Text style={[styles.resultValue, { color: palette.emerald }]}>
                    {Math.round(confirmed.new_tdee)}
                  </Text>
                </View>
              </View>

              <View style={styles.metabolicBox}>
                <Text style={styles.metabolicTitle}>¡Ecuación metabólica actualizada!</Text>
                <Text style={styles.metabolicDesc}>
                  Ahora usamos{' '}
                  <Text style={{ color: palette.cyan, fontWeight: 'bold' }}>
                    {EQUATION_LABELS[confirmed.equation_used] ?? confirmed.equation_used}
                  </Text>
                  , que se basa en tu masa magra. Tu objetivo diario es de{' '}
                  <Text style={{ color: palette.amber, fontWeight: 'bold' }}>
                    {Math.round(confirmed.new_calorie_target)} kcal
                  </Text>
                  .
                </Text>
              </View>

              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Escanear de nuevo</Text>
              </Pressable>
            </GlassCard>
          ) : null}

          <View style={{ height: Spacing['3xl'] }} />
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 60 },

  header: { marginBottom: Spacing.xl },
  title: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
  },
  subtitle: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },

  cameraContainer: {
    backgroundColor: '#0a0f18',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.md,
  },
  placeholderBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  instructionText: {
    color: palette.gray400,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing['2xl'],
    lineHeight: 22,
  },
  instructionTextOverlay: {
    position: 'absolute',
    bottom: 110,
    left: Spacing.lg,
    right: Spacing.lg,
    color: palette.white,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: Typography.size.sm,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  permissionBtn: {
    backgroundColor: palette.emerald,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  permissionBtnText: { color: palette.dark900, fontWeight: Typography.weight.bold },

  silhouetteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  countdownText: {
    color: palette.white,
    fontSize: 96,
    fontWeight: Typography.weight.bold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 12,
  },
  cameraControls: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  flipBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: palette.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Silhouette guide
  silhouetteContainer: { alignItems: 'center', opacity: 0.45 },
  silhouetteHead: {
    width: 60,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: palette.emerald,
    marginBottom: 5,
  },
  silhouetteBody: {
    width: 120,
    height: 140,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: palette.emerald,
    marginBottom: 5,
  },
  silhouetteLegs: {
    width: 80,
    height: 120,
    borderWidth: 2,
    borderColor: palette.emerald,
    borderTopWidth: 0,
  },

  imageBox: { flex: 1 },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  analyzingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingText: {
    color: palette.emerald,
    marginTop: Spacing.md,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  privacyText: { color: palette.gray400, fontSize: Typography.size.xs, flex: 1 },

  // Results
  resultCard: { padding: Spacing.lg, marginBottom: Spacing.lg },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  resultTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  resultGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  resultItem: { alignItems: 'center' },
  resultLabel: { color: palette.gray400, fontSize: Typography.size.sm, marginBottom: 4 },
  resultValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  warningText: { color: palette.coral, fontSize: Typography.size.sm, flex: 1, lineHeight: 19 },

  notesText: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },

  factorsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  factorChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  factorChipText: { color: palette.gray300, fontSize: Typography.size.xs },

  adjustLabel: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
    marginBottom: Spacing.xs,
  },
  adjustInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },

  projectionBox: {
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  projectionTitle: {
    color: palette.emerald,
    fontWeight: Typography.weight.bold,
    marginBottom: 4,
  },
  projectionDesc: { color: palette.gray300, lineHeight: 20 },

  confirmBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  confirmGradient: {
    paddingVertical: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  confirmText: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  metabolicBox: {
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  metabolicTitle: {
    color: palette.emerald,
    fontWeight: Typography.weight.bold,
    marginBottom: 4,
  },
  metabolicDesc: { color: palette.gray300, lineHeight: 20 },

  resetBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  resetBtnText: {
    color: palette.gray400,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
  },
});
