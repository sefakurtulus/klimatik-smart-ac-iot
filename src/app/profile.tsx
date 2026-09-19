import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAcStore } from '@/store/useAcStore';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.four, paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Profil</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <Text style={{ fontSize: 40, color: '#FFF', fontWeight: '700' }}>{store.deviceName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{store.deviceName}</Text>
          <Text style={[styles.email, { color: theme.textSecondary }]}>Yönetici Hesabı</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, marginBottom: Spacing.four }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Cihaz ve Bağlantı Adı</Text>
          <View style={[styles.inputContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="home-account" size={20} color={theme.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={store.deviceName}
              onChangeText={store.setDeviceName}
              placeholder="Cihaz Adı / Ev Halkı (Örn: Sefa'nın Telefonu)"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <MaterialCommunityIcons name="leaf" size={24} color={theme.success} />
              <Text style={[styles.statTitle, { color: theme.text }]}>120 kg</Text>
              <Text style={[styles.statDesc, { color: theme.textSecondary }]}>CO2 Tasarrufu</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.stat}>
              <MaterialCommunityIcons name="star-circle" size={24} color="#FFD700" />
              <Text style={[styles.statTitle, { color: theme.text }]}>Seviye 4</Text>
              <Text style={[styles.statDesc, { color: theme.textSecondary }]}>Enerji Uzmanı</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingVertical: Spacing.four,
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: Spacing.six,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    marginBottom: Spacing.three,
    ...Shadows.floating,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
    gap: 8,
  },
  statTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statDesc: {
    fontSize: 12,
  },
  divider: {
    width: 1,
    height: 40,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.three,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    height: 40,
  },
});
