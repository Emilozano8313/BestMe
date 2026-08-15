/**
 * BestMe — AI Meal Validation Screen
 * ====================================
 * Receives the AI's best guess of foods in an image.
 * Allows the user to edit amounts (grams) or correct the AI's guesses
 * to resolve monocular ambiguity before saving to the DB.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import api from '@/services/api';

interface DetectedFood {
  food: string;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export default function ValidationScreen() {
  const router = useRouter();
  const { imageUri, aiData } = useLocalSearchParams<{ imageUri: string; aiData: string }>();

  // Parse the initial AI data (which is a JSON string of DetectedFood array)
  const initialFoods: DetectedFood[] = aiData ? JSON.parse(aiData) : [];
  
  const [foods, setFoods] = useState<DetectedFood[]>(initialFoods);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Handlers ──────────────────────────────────────────────────

  const updateFood = (index: number, field: keyof DetectedFood, value: string) => {
    const newFoods = [...foods];
    if (field === 'food') {
      newFoods[index].food = value;
    } else {
      // Parse numeric fields
      const numValue = parseFloat(value) || 0;
      
      // If we change the weight, we should proportionally scale the macros/calories
      if (field === 'weight_g' && newFoods[index].weight_g > 0) {
        const ratio = numValue / newFoods[index].weight_g;
        newFoods[index].calories = Math.round(newFoods[index].calories * ratio);
        newFoods[index].protein_g = Math.round(newFoods[index].protein_g * ratio * 10) / 10;
        newFoods[index].carbs_g = Math.round(newFoods[index].carbs_g * ratio * 10) / 10;
        newFoods[index].fat_g = Math.round(newFoods[index].fat_g * ratio * 10) / 10;
      }
      
      (newFoods[index][field] as number) = numValue;
    }
    setFoods(newFoods);
  };

  const removeFood = (index: number) => {
    setFoods(foods.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (foods.length === 0) {
      setError('Debes incluir al menos un alimento');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Send to POST /api/meals/
      const res = await api.post('/meals/', {
        meal_type: 'lunch', // Ideally, allow user to select or infer from time
        description: 'Auto-detectado',
        photo_url: null, // Would require S3 upload first, skipping for now
        detected_foods: foods,
        manually_adjusted: true, // We assume true since they saw this screen
      });

      if (res.error) {
        throw new Error(res.error);
      }

      // Go back to nutrition tab
      router.replace('/(tabs)/nutrition');
    } catch (err: any) {
      setError(err.message || 'Error al guardar la comida');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Computed Totals ───────────────────────────────────────────

  const totalCals = Math.round(foods.reduce((sum, f) => sum + f.calories, 0));
  const totalProtein = Math.round(foods.reduce((sum, f) => sum + f.protein_g, 0));
  const totalCarbs = Math.round(foods.reduce((sum, f) => sum + f.carbs_g, 0));
  const totalFat = Math.round(foods.reduce((sum, f) => sum + f.fat_g, 0));

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={palette.gray300} />
          </Pressable>
          <Text style={styles.title}>Validar Comida</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Image Preview */}
          {imageUri && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
              <View style={styles.imageOverlay}>
                <Ionicons name="sparkles" size={16} color={palette.emerald} />
                <Text style={styles.imageOverlayText}>Análisis IA</Text>
              </View>
            </View>
          )}

          <Text style={styles.infoText}>
            Revisa y corrige las estimaciones. Las fotos no tienen profundidad,
            por lo que la IA puede calcular mal los gramos exactos.
          </Text>

          {/* Totals Summary */}
          <GlassCard style={styles.summaryCard} variant="highlight">
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Kcal</Text>
                <Text style={[styles.summaryValue, { color: palette.emerald }]}>{totalCals}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Proteína</Text>
                <Text style={styles.summaryValue}>{totalProtein}g</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Carbos</Text>
                <Text style={styles.summaryValue}>{totalCarbs}g</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Grasas</Text>
                <Text style={styles.summaryValue}>{totalFat}g</Text>
              </View>
            </View>
          </GlassCard>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Food List */}
          {foods.map((food, index) => (
            <GlassCard key={index} style={styles.foodCard}>
              <View style={styles.foodHeader}>
                <TextInput
                  style={styles.foodNameInput}
                  value={food.food}
                  onChangeText={(val) => updateFood(index, 'food', val)}
                  placeholder="Nombre del alimento"
                  placeholderTextColor={palette.gray500}
                />
                <Pressable onPress={() => removeFood(index)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color={palette.coral} />
                </Pressable>
              </View>

              <View style={styles.macrosGrid}>
                {/* Grams (Editable) */}
                <View style={styles.macroInputGroup}>
                  <Text style={styles.macroInputLabel}>Gramos (g)</Text>
                  <TextInput
                    style={styles.macroInput}
                    value={food.weight_g.toString()}
                    onChangeText={(val) => updateFood(index, 'weight_g', val)}
                    keyboardType="numeric"
                  />
                </View>

                {/* Calories (Editable) */}
                <View style={styles.macroInputGroup}>
                  <Text style={styles.macroInputLabel}>Kcal</Text>
                  <TextInput
                    style={styles.macroInput}
                    value={food.calories.toString()}
                    onChangeText={(val) => updateFood(index, 'calories', val)}
                    keyboardType="numeric"
                  />
                </View>

                {/* Protein */}
                <View style={styles.macroInputGroup}>
                  <Text style={styles.macroInputLabel}>Prot (g)</Text>
                  <TextInput
                    style={styles.macroInput}
                    value={food.protein_g.toString()}
                    onChangeText={(val) => updateFood(index, 'protein_g', val)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </GlassCard>
          ))}

          {/* Confirm Button */}
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
            onPress={handleConfirm}
            disabled={isSubmitting}
          >
            <LinearGradient
              colors={[palette.emerald, palette.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.confirmGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <>
                  <Text style={styles.confirmText}>Confirmar y Guardar</Text>
                  <Ionicons name="checkmark-circle-outline" size={24} color={palette.white} />
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={{ height: Spacing['3xl'] }} />
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gradient: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.base,
    paddingHorizontal: Spacing.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.8)', // semi-transparent dark900
  },
  closeBtn: { padding: Spacing.xs },
  title: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Image Preview
  imageContainer: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  imageOverlayText: {
    color: palette.emerald,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },

  infoText: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    lineHeight: 20,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },

  // Summary
  summaryCard: { marginBottom: Spacing.xl },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginBottom: 4,
  },
  summaryValue: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Error
  errorText: {
    color: palette.coral,
    fontSize: Typography.size.sm,
    marginBottom: Spacing.base,
    textAlign: 'center',
  },

  // Foods
  foodCard: {
    marginBottom: Spacing.md,
    padding: Spacing.base,
  },
  foodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: Spacing.sm,
  },
  foodNameInput: {
    flex: 1,
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
  },
  deleteBtn: {
    padding: Spacing.xs,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: BorderRadius.sm,
  },

  macrosGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  macroInputGroup: {
    flex: 1,
  },
  macroInputLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginBottom: 4,
  },
  macroInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    textAlign: 'center',
  },

  // Button
  confirmBtn: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xl,
  },
  confirmGradient: {
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  confirmText: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
});
