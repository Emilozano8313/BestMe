/**
 * BestMe — Body Scanner
 * =======================
 * Captures orthogonal full-body photos using a silhouette guide.
 * Evaluates body fat percentage using Edge/Cloud AI and triggers
 * the metabolic transition (Mifflin-St Jeor -> Katch-McArdle).
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter } from 'expo-router';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export default function ScannerScreen() {
  const router = useRouter();
  const { refreshMetabolicProfile } = useAuth();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const handleCapture = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara.');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (pickerResult.canceled) return;

    try {
      setIsAnalyzing(true);
      const uri = pickerResult.assets[0].uri;
      setImageUri(uri);

      // Resize for faster upload to GPT-4V
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { height: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Send to Vision API
      const response = await api.uploadImage<any>('/scans/analyze', manipResult.uri);
      
      if (response.error || !response.data) {
        throw new Error(response.error || 'Error en el escaneo');
      }

      setScanResult(response.data);
      // Refresh context so the Home Screen updates immediately with Katch-McArdle
      await refreshMetabolicProfile();

    } catch (error: any) {
      Alert.alert('Error', error.message);
      setImageUri(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setImageUri(null);
    setScanResult(null);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.gradient}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Escáner Corporal</Text>
          <Text style={styles.subtitle}>
            Estima tu % de grasa y recalibra tu metabolismo.
          </Text>
        </View>

        {/* Camera Area / Results */}
        <View style={styles.cameraContainer}>
          {!imageUri ? (
            <View style={styles.placeholderBox}>
              <View style={styles.silhouetteContainer}>
                {/* SVG Silhouette representation (using borders for now) */}
                <View style={styles.silhouetteHead} />
                <View style={styles.silhouetteBody} />
                <View style={styles.silhouetteLegs} />
              </View>
              <Text style={styles.instructionText}>
                Alinea tu cuerpo con la silueta. Toma la foto de frente o de perfil.
              </Text>
              
              <Pressable style={styles.captureBtn} onPress={handleCapture}>
                <Ionicons name="camera" size={32} color={palette.dark900} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.imageBox}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
              
              {isAnalyzing && (
                <View style={styles.analyzingOverlay}>
                  <ActivityIndicator size="large" color={palette.emerald} />
                  <Text style={styles.analyzingText}>Procesando polígonos...</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Results Card */}
        {scanResult && (
          <GlassCard style={styles.resultCard} variant="highlight">
            <View style={styles.resultHeader}>
              <Ionicons name="checkmark-circle" size={24} color={palette.emerald} />
              <Text style={styles.resultTitle}>Análisis Completado</Text>
            </View>
            
            <View style={styles.resultGrid}>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Grasa Corporal</Text>
                <Text style={styles.resultValue}>{scanResult.estimated_body_fat}%</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>Confiabilidad</Text>
                <Text style={styles.resultValue}>{Math.round(scanResult.confidence_score * 100)}%</Text>
              </View>
            </View>

            <View style={styles.metabolicBox}>
              <Text style={styles.metabolicTitle}>¡Ecuación Metabólica Actualizada!</Text>
              <Text style={styles.metabolicDesc}>
                El motor ha transicionado exitosamente a <Text style={{ color: palette.cyan, fontWeight: 'bold' }}>{scanResult.equation_used}</Text>. 
                Tu nuevo TDEE es de <Text style={{ color: palette.amber, fontWeight: 'bold' }}>{Math.round(scanResult.new_tdee)} kcal</Text>.
              </Text>
            </View>

            <Pressable style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetBtnText}>Escanear de nuevo</Text>
            </Pressable>
          </GlassCard>
        )}

      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gradient: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: 60 },
  
  header: { marginBottom: Spacing.xl },
  title: { color: palette.white, fontSize: Typography.size['3xl'], fontWeight: Typography.weight.bold },
  subtitle: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },

  cameraContainer: {
    flex: 1,
    maxHeight: 450,
    backgroundColor: '#0a0f18',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.xl,
  },
  placeholderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  instructionText: {
    color: palette.gray400,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing['2xl'],
    lineHeight: 22,
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

  // Silhouette drawing
  silhouetteContainer: {
    alignItems: 'center',
    opacity: 0.2,
  },
  silhouetteHead: {
    width: 60, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: palette.emerald,
    marginBottom: 5,
  },
  silhouetteBody: {
    width: 120, height: 140, borderRadius: 20,
    borderWidth: 2, borderColor: palette.emerald,
    marginBottom: 5,
  },
  silhouetteLegs: {
    width: 80, height: 120,
    borderWidth: 2, borderColor: palette.emerald,
    borderTopWidth: 0,
  },

  imageBox: { flex: 1 },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
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

  // Results
  resultCard: { padding: Spacing.lg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  resultTitle: { color: palette.white, fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },
  
  resultGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.lg },
  resultItem: { alignItems: 'center' },
  resultLabel: { color: palette.gray400, fontSize: Typography.size.sm, marginBottom: 4 },
  resultValue: { color: palette.white, fontSize: Typography.size['2xl'], fontWeight: Typography.weight.bold },

  metabolicBox: {
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  metabolicTitle: { color: palette.emerald, fontWeight: Typography.weight.bold, marginBottom: 4 },
  metabolicDesc: { color: palette.gray300, lineHeight: 20 },

  resetBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  resetBtnText: { color: palette.gray400, fontSize: Typography.size.md, fontWeight: Typography.weight.medium },
});
