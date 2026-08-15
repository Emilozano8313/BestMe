/**
 * BestMe — Nutrition Screen
 * ============================
 * Daily nutrition tracking with meal list, calorie summary,
 * and camera shortcut for AI food analysis.
 * Now connected to real backend data.
 */

import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { MacroBar } from '@/components/ui/MacroBar';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

interface Meal {
  id: string;
  meal_type: string;
  description: string | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  detected_foods: any[];
  logged_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Snack',
};

const TYPE_ICONS: Record<string, any> = {
  breakfast: { icon: 'sunny-outline', color: palette.amber },
  lunch: { icon: 'restaurant-outline', color: palette.emerald },
  dinner: { icon: 'moon-outline', color: palette.violet },
  snack: { icon: 'cafe-outline', color: palette.cyan },
};

/** Best guess at which meal this is, from the clock. The user can change it. */
function inferMealType(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}

export default function NutritionScreen() {
  const router = useRouter();
  const { metabolicProfile, refreshMetabolicProfile } = useAuth();
  
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reloads on focus so a meal saved on the validation screen shows up
  // as soon as the user lands back here.
  useFocusEffect(
    useCallback(() => {
      void loadMeals();
      void refreshMetabolicProfile();
    }, []),
  );

  const loadMeals = async () => {
    setIsLoading(true);
    const res = await api.get<Meal[]>('/meals/today');
    if (res.data) setMeals(res.data);
    setLoadError(res.error);
    setIsLoading(false);
  };

  // ── Camera / AI Flow ──────────────────────────────────────────

  const handleScanFood = async () => {
    // 1. Request permissions
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para escanear tu comida.');
      return;
    }

    // 2. Launch Camera
    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (pickerResult.canceled) return;

    try {
      setIsAnalyzing(true);
      const uri = pickerResult.assets[0].uri;

      // 3. Resize before upload — a 4K photo costs bandwidth and image
      // tokens without improving the estimate.
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // 4. Send to API
      const response = await api.uploadImage<{ foods: any[]; is_mock: boolean }>(
        '/meals/analyze',
        manipResult.uri,
      );

      if (response.error || !response.data) {
        throw new Error(response.error || 'Error al analizar la imagen');
      }

      if (response.data.is_mock) {
        Alert.alert(
          'Modo de ejemplo',
          'El servidor no tiene configurada la clave de IA, así que estos alimentos ' +
            'son de ejemplo y no corresponden a tu foto. Añade ANTHROPIC_API_KEY en el backend.',
        );
      }

      // 5. Navigate to Validation screen with AI data
      router.push({
        pathname: '/(meals)/validation',
        params: {
          imageUri: manipResult.uri,
          aiData: JSON.stringify(response.data.foods),
          mealType: inferMealType(),
        },
      });

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Computations ──────────────────────────────────────────────

  const targetCalories = metabolicProfile ? Math.round(metabolicProfile.calorie_target) : 2000;
  const targetProtein = metabolicProfile ? Math.round(metabolicProfile.macros.protein_g) : 150;
  const targetCarbs = metabolicProfile ? Math.round(metabolicProfile.macros.carbs_g) : 200;
  const targetFat = metabolicProfile ? Math.round(metabolicProfile.macros.fat_g) : 60;

  const consumedCals = meals.reduce((sum, m) => sum + m.total_calories, 0);
  const consumedProtein = meals.reduce((sum, m) => sum + m.total_protein_g, 0);
  const consumedCarbs = meals.reduce((sum, m) => sum + m.total_carbs_g, 0);
  const consumedFat = meals.reduce((sum, m) => sum + m.total_fat_g, 0);

  const today = new Date().toLocaleDateString('es-ES', { month: 'long', day: 'numeric' });

  // ── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={palette.emerald} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.dark900} />
      
      {/* Overlay during AI analysis */}
      {isAnalyzing && (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator size="large" color={palette.emerald} />
          <Text style={styles.analyzingText}>Analizando comida con IA...</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Nutrición</Text>
          <Text style={styles.date}>Hoy, {today}</Text>
        </View>

        {loadError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={palette.coral} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </View>
        ) : null}

        {/* Summary Card */}
        <GlassCard variant="highlight" style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Consumidas</Text>
              <Text style={[styles.summaryValue, { color: palette.emerald }]}>{Math.round(consumedCals)}</Text>
              <Text style={styles.summaryUnit}>kcal</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Restantes</Text>
              <Text style={[styles.summaryValue, { color: palette.cyan }]}>{Math.max(0, targetCalories - consumedCals)}</Text>
              <Text style={styles.summaryUnit}>kcal</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Comidas</Text>
              <Text style={[styles.summaryValue, { color: palette.violet }]}>{meals.length}</Text>
              <Text style={styles.summaryUnit}>hoy</Text>
            </View>
          </View>
        </GlassCard>

        {/* Macros */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Macros del Día</Text>
          <MacroBar label="Proteína" current={consumedProtein} target={targetProtein} color={palette.protein} />
          <MacroBar label="Carbohidratos" current={consumedCarbs} target={targetCarbs} color={palette.carbs} />
          <MacroBar label="Grasas" current={consumedFat} target={targetFat} color={palette.fat} />
        </GlassCard>

        {/* Meals List */}
        <View style={styles.mealsHeaderRow}>
          <Text style={styles.sectionTitleOuter}>Historial de Hoy</Text>
          <Pressable onPress={loadMeals}>
            <Ionicons name="refresh" size={20} color={palette.emerald} />
          </Pressable>
        </View>

        {meals.length === 0 ? (
          <Text style={styles.emptyState}>No has registrado comidas hoy. Usa el botón de cámara para escanear tu primera comida.</Text>
        ) : (
          meals.map((meal) => {
            const ui = TYPE_ICONS[meal.meal_type] || TYPE_ICONS.snack;
            const title = TYPE_LABELS[meal.meal_type] || meal.meal_type;
            const foodsStr = meal.detected_foods.map(f => f.food).join(', ');

            return (
              <GlassCard key={meal.id} style={styles.mealCard}>
                <View style={styles.mealRow}>
                  <LinearGradient colors={[`${ui.color}20`, `${ui.color}08`]} style={styles.mealIcon}>
                    <Ionicons name={ui.icon} size={22} color={ui.color} />
                  </LinearGradient>

                  <View style={styles.mealInfo}>
                    <Text style={styles.mealType}>{title}</Text>
                    <Text style={styles.mealFoods} numberOfLines={1}>
                      {foodsStr || meal.description || 'Comida'}
                    </Text>
                  </View>

                  <View style={styles.mealRight}>
                    <Text style={styles.mealCalories}>{Math.round(meal.total_calories)}</Text>
                    <Text style={styles.mealCalLabel}>kcal</Text>
                  </View>
                </View>
              </GlassCard>
            );
          })
        )}

        <View style={{ height: Spacing['5xl'] }} />
      </ScrollView>

      {/* FAB: Scan Food */}
      <Pressable style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]} onPress={handleScanFood}>
        <LinearGradient colors={[palette.emerald, palette.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
          <Ionicons name="camera" size={26} color={palette.white} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.dark900 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },
  
  analyzingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingText: {
    color: palette.emerald,
    marginTop: Spacing.md,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  header: { marginBottom: Spacing.xl },
  title: { color: palette.white, fontSize: Typography.size['3xl'], fontWeight: Typography.weight.bold },
  date: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  errorBannerText: { color: palette.coral, fontSize: Typography.size.sm, flex: 1 },

  summaryCard: { marginBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLabel: { color: palette.gray300, fontSize: Typography.size.xs, fontWeight: Typography.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.bold, marginTop: 4 },
  summaryUnit: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },
  summaryDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.06)' },

  section: { marginBottom: Spacing.lg },
  sectionTitle: { color: palette.white, fontSize: Typography.size.lg, fontWeight: Typography.weight.semibold, marginBottom: Spacing.base },
  
  mealsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitleOuter: { color: palette.white, fontSize: Typography.size.lg, fontWeight: Typography.weight.semibold },
  
  emptyState: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: 20,
  },

  mealCard: { marginBottom: Spacing.sm },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  mealIcon: { width: 46, height: 46, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealType: { color: palette.white, fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
  mealFoods: { color: palette.gray300, fontSize: Typography.size.sm, marginTop: 2 },
  mealRight: { alignItems: 'flex-end' },
  mealCalories: { color: palette.white, fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },
  mealCalLabel: { color: palette.gray400, fontSize: Typography.size.xs },

  fab: { position: 'absolute', bottom: Spacing['2xl'], right: Spacing.lg, shadowColor: palette.emerald, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  fabGradient: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
