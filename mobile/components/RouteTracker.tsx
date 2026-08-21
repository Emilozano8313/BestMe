/**
 * BestMe — Route Tracker
 * ========================
 * GPS-based distance + time tracking for caminar/correr/ciclismo. Distance
 * is accumulated client-side from consecutive GPS fixes (haversine), with
 * two filters against noisy fixes: a max accuracy radius and a max
 * plausible speed per segment — both meant to drop obvious GPS jumps
 * without discarding legitimately fast (but real) movement.
 *
 * Foreground-only: tracking stops if the app is backgrounded, since
 * background location needs a separate "Always" permission and a
 * persistent-notification setup this app doesn't have yet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { formatClock, formatPace, haversineDistanceKm } from '@/utils/geo';
import api from '@/services/api';

type Activity = 'caminar' | 'correr' | 'ciclismo';

const ACTIVITIES: { value: Activity; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'caminar', label: 'Caminar', icon: 'walk-outline' },
  { value: 'correr', label: 'Correr', icon: 'body-outline' },
  { value: 'ciclismo', label: 'Ciclismo', icon: 'bicycle-outline' },
];

// A fix worse than this radius is noise, not a real position — skip it and
// wait for the next one rather than let it corrupt the distance total.
const MAX_ACCURACY_M = 30;

// Per-activity ceiling on implied segment speed. Real movement rarely
// exceeds these; a jump past them is almost always a bad GPS fix, not the
// user actually moving that fast.
const MAX_PLAUSIBLE_SPEED_KMH: Record<Activity, number> = {
  caminar: 15,
  correr: 30,
  ciclismo: 90,
};

interface SavedRoute {
  calories_burned: number;
  distance_km: number | null;
  duration_seconds: number | null;
}

interface LastPoint {
  lat: number;
  lng: number;
  timestampMs: number;
}

export function RouteTracker() {
  const [activity, setActivity] = useState<Activity>('caminar');
  const [tracking, setTracking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedRoute, setSavedRoute] = useState<SavedRoute | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const lastPointRef = useRef<LastPoint | null>(null);
  const pointCountRef = useRef(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Overall stopwatch, ticks once a second while tracking.
  useEffect(() => {
    if (!tracking) return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [tracking]);

  // Never leave a GPS watcher running past this screen's lifetime.
  useEffect(() => {
    return () => {
      watchRef.current?.remove();
    };
  }, []);

  const handleLocationUpdate = useCallback(
    (loc: Location.LocationObject) => {
      const { latitude, longitude, accuracy } = loc.coords;
      if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

      pointCountRef.current += 1;
      const prev = lastPointRef.current;

      if (!prev) {
        lastPointRef.current = { lat: latitude, lng: longitude, timestampMs: loc.timestamp };
        return;
      }

      const segmentKm = haversineDistanceKm(prev.lat, prev.lng, latitude, longitude);
      const dtHours = (loc.timestamp - prev.timestampMs) / 3_600_000;
      const impliedSpeedKmh = dtHours > 0 ? segmentKm / dtHours : 0;

      if (impliedSpeedKmh <= MAX_PLAUSIBLE_SPEED_KMH[activity]) {
        setDistanceKm((d) => d + segmentKm);
        lastPointRef.current = { lat: latitude, lng: longitude, timestampMs: loc.timestamp };
      }
      // Otherwise: likely a GPS jump — drop it and keep the previous point,
      // so the next real fix is measured from solid ground.
    },
    [activity],
  );

  const handleStart = useCallback(async () => {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) {
      Alert.alert('Ubicación desactivada', 'Activa el GPS del teléfono para registrar el recorrido.');
      return;
    }

    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      Alert.alert(
        'Permiso de ubicación necesario',
        'BestMe necesita acceso a tu ubicación para medir la distancia del recorrido. Actívalo en Ajustes.',
      );
      return;
    }

    setSavedRoute(null);
    setQueuedMessage(null);
    setDistanceKm(0);
    setElapsedSeconds(0);
    lastPointRef.current = null;
    pointCountRef.current = 0;
    startedAtRef.current = Date.now();
    setTracking(true);

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      handleLocationUpdate,
    );
  }, [handleLocationUpdate]);

  const handleFinish = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;
    setTracking(false);

    const startedAt = startedAtRef.current;
    if (startedAt === null) return;

    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const finalDistanceKm = Math.round(distanceKm * 1000) / 1000;

    if (finalDistanceKm < 0.02) {
      Alert.alert(
        'Recorrido muy corto',
        'No se registró suficiente distancia como para guardarlo. Verifica que el GPS esté activo la próxima vez.',
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.post<SavedRoute>(
        '/workouts/',
        {
          exercise_name: activity,
          total_reps: 0,
          duration_seconds: duration,
          distance_km: finalDistanceKm,
          started_at: new Date(startedAt).toISOString(),
          sets: [],
          analysis_summary: {
            source: 'recorrido_gps',
            activity,
            gps_points: pointCountRef.current,
          },
        },
        'Recorrido registrado',
      );

      if (res.queued) {
        setQueuedMessage(
          'Recorrido guardado sin conexión — se sincronizará y sumará tus calorías apenas vuelva el internet.',
        );
        return;
      }
      if (res.error || !res.data) {
        throw new Error(res.error ?? 'No se pudo guardar el recorrido');
      }
      setSavedRoute(res.data);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo guardar el recorrido.');
    } finally {
      setIsSaving(false);
    }
  }, [activity, distanceKm]);

  const pace = formatPace(elapsedSeconds, distanceKm);

  return (
    <GlassCard style={styles.card} variant="highlight">
      <View style={styles.header}>
        <Text style={styles.title}>Recorrido</Text>
        <View style={styles.gpsTag}>
          <Ionicons name="navigate-outline" size={11} color={palette.cyan} />
          <Text style={styles.gpsTagText}>GPS</Text>
        </View>
      </View>

      <View style={[styles.activityRow, tracking && styles.activityRowDisabled]}>
        {ACTIVITIES.map((item) => {
          const active = activity === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => !tracking && setActivity(item.value)}
              style={[styles.activityChip, active && styles.activityChipActive]}
            >
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? palette.dark900 : palette.gray300}
              />
              <Text style={[styles.activityChipText, active && styles.activityChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tracking ? (
        <View style={styles.liveBox}>
          <View style={styles.liveStatsRow}>
            <View style={styles.liveStat}>
              <Text style={styles.liveStatValue}>{distanceKm.toFixed(2)}</Text>
              <Text style={styles.liveStatLabel}>km</Text>
            </View>
            <View style={styles.liveStatDivider} />
            <View style={styles.liveStat}>
              <Text style={styles.liveStatValue}>{formatClock(elapsedSeconds)}</Text>
              <Text style={styles.liveStatLabel}>tiempo</Text>
            </View>
          </View>
          {pace ? <Text style={styles.paceText}>Ritmo: {pace}</Text> : null}

          <Pressable style={styles.finishBtn} onPress={handleFinish} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color={palette.dark900} />
            ) : (
              <>
                <Ionicons name="stop-circle" size={18} color={palette.dark900} />
                <Text style={styles.finishBtnText}>Terminar recorrido</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.startBtn} onPress={handleStart}>
          <Ionicons name="play-circle" size={20} color={palette.dark900} />
          <Text style={styles.startBtnText}>Iniciar recorrido</Text>
        </Pressable>
      )}

      {!tracking && savedRoute ? (
        <View style={styles.summaryBox}>
          <Ionicons name="flag-outline" size={16} color={palette.emerald} />
          <Text style={styles.summaryText}>
            {savedRoute.distance_km?.toFixed(2)} km en {formatClock(savedRoute.duration_seconds ?? 0)}
            {' · '}
            {Math.round(savedRoute.calories_burned)} kcal
          </Text>
        </View>
      ) : !tracking && queuedMessage ? (
        <View style={styles.summaryBoxOffline}>
          <Ionicons name="cloud-offline-outline" size={16} color={palette.amber} />
          <Text style={styles.summaryTextOffline}>{queuedMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.hint}>
        Mantén la pantalla encendida y la app abierta durante el recorrido — el rastreo se
        detiene si la app pasa a segundo plano.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  title: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
  },
  gpsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(59, 205, 255, 0.10)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  gpsTagText: { color: palette.cyan, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold },

  activityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  activityRowDisabled: { opacity: 0.4 },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activityChipActive: { backgroundColor: palette.cyan },
  activityChipText: { color: palette.gray300, fontSize: Typography.size.sm },
  activityChipTextActive: { color: palette.dark900, fontWeight: Typography.weight.bold },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: palette.cyan,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  startBtnText: { color: palette.dark900, fontSize: Typography.size.md, fontWeight: Typography.weight.bold },

  liveBox: {
    backgroundColor: 'rgba(59, 205, 255, 0.08)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(59, 205, 255, 0.25)',
    padding: Spacing.md,
    alignItems: 'center',
  },
  liveStatsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  liveStat: { alignItems: 'center' },
  liveStatValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  liveStatLabel: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },
  liveStatDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)' },
  paceText: { color: palette.gray300, fontSize: Typography.size.sm, marginTop: Spacing.sm },

  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: palette.coral,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    width: '100%',
  },
  finishBtnText: { color: palette.dark900, fontSize: Typography.size.sm, fontWeight: Typography.weight.bold },

  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
  summaryText: { color: palette.emerald, fontSize: Typography.size.sm, flex: 1, fontWeight: Typography.weight.semibold },

  summaryBoxOffline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 179, 64, 0.08)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
  summaryTextOffline: { color: palette.amber, fontSize: Typography.size.xs, flex: 1, lineHeight: 16 },

  hint: {
    color: palette.gray500,
    fontSize: Typography.size.xs,
    lineHeight: 15,
    marginTop: Spacing.sm,
  },
});
