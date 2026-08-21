/**
 * BestMe — Offline Banner
 * ==========================
 * A thin strip pinned under the status bar whenever there's no connection
 * or a write is still waiting to sync. Silent (renders nothing) the rest
 * of the time — most sessions never see it.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '@/constants/Colors';
import { Typography, Spacing } from '@/constants/Theme';
import { useNetwork } from '@/context/NetworkContext';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOffline, pendingCount, syncNow } = useNetwork();

  if (!isOffline && pendingCount === 0) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : 'cloud-upload-outline'}
        size={14}
        color={isOffline ? palette.amber : palette.cyan}
      />
      <Text style={styles.text}>
        {isOffline
          ? pendingCount > 0
            ? `Sin conexión — viendo datos guardados · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} por sincronizar`
            : 'Sin conexión — viendo datos guardados'
          : `Sincronizando ${pendingCount} cambio${pendingCount === 1 ? '' : 's'}...`}
      </Text>
      {!isOffline && pendingCount > 0 ? (
        <Pressable onPress={() => void syncNow()} hitSlop={8}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.dark800,
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  text: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    flex: 1,
  },
  retryText: {
    color: palette.cyan,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
});
