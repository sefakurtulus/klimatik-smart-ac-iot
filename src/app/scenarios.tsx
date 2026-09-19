import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';
import { useRouter } from 'expo-router';

export default function AutomationsListScreen() {
  const insets = useSafeAreaInsets();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];
  const router = useRouter();

  // For live countdown updates in the UI
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (store.activeSession?.status === 'RUNNING') {
      interval = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [store.activeSession?.status]);

  const handlePlay = (id: string) => {
    if (store.activeSession?.status === 'RUNNING') {
      Alert.alert("Hata", "Zaten çalışan bir otomasyon var. Önce onu durdurmalısınız.");
      return;
    }
    store.startAutomation(id);
  };

  const handleStop = () => {
    Alert.alert(
      "Otomasyonu Durdur",
      "Çalışan otomasyonu iptal etmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { text: "Evet, Durdur", style: "destructive", onPress: () => store.stopAutomation() }
      ]
    );
  };

  const handleDeleteScenario = (id: string) => {
    Alert.alert(
      "Otomasyonu Sil",
      "Bu otomasyonu kalıcı olarak silmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { text: "Evet, Sil", style: "destructive", onPress: () => store.deleteScenario(id) }
      ]
    );
  };

  const renderActiveSession = () => {
    if (!store.activeSession || store.activeSession.status !== 'RUNNING') return null;
    
    const scenario = store.scenarios.find(s => s.id === store.activeSession!.scenarioId);
    if (!scenario) return null;

    const session = store.activeSession;
    const currentNode = scenario.nodes[session.currentNodeIndex];
    if (!currentNode) return null;
    
    const elapsedSecs = Math.floor((now - session.nodeStartedAt) / 1000);
    const totalNodeSecs = currentNode.durationMinutes * 60;
    const remainingSecs = Math.max(0, totalNodeSecs - elapsedSecs);
    const mins = Math.floor(remainingSecs / 60);
    const secs = remainingSecs % 60;

    const totalElapsedMins = Math.floor((now - session.startedAt) / 60000);

    return (
      <View style={[styles.activeCard, { backgroundColor: `${theme.primary}15`, borderColor: theme.primary }]}>
        <View style={styles.activeHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="cog-transfer" size={24} color={theme.primary} />
            <Text style={[styles.activeTitle, { color: theme.text }]}>{scenario.name}</Text>
          </View>
          <TouchableOpacity onPress={handleStop} style={styles.stopBtn}>
            <MaterialCommunityIcons name="stop-circle-outline" size={28} color={theme.warn} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: theme.textSecondary, marginBottom: 8 }}>
          Otomasyon {totalElapsedMins} dakikadır aktif.
        </Text>

        <View style={[styles.activeNodeBox, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.nodeStep, { color: theme.primary }]}>
            Şu an: Adım {session.currentNodeIndex + 1} / {scenario.nodes.length}
          </Text>
          <Text style={[styles.nodeState, { color: theme.text }]}>
            {currentNode.power ? `${currentNode.temp}°C • ${currentNode.mode} • ${currentNode.fanSpeed} Fan` : 'Klima Kapalı'}
          </Text>
          <View style={styles.timerRow}>
            <MaterialCommunityIcons name="timer-sand" size={16} color={theme.warn} />
            <Text style={[styles.timerText, { color: theme.warn }]}>
              Sonraki adıma: {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')} kaldı
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: any) => {
    const isRunning = store.activeSession?.scenarioId === item.id && store.activeSession?.status === 'RUNNING';
    const totalMinutes = item.nodes.reduce((acc: number, curr: any) => acc + curr.durationMinutes, 0);

    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: isRunning ? theme.primary : theme.border }]}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.primary}15` }]}>
          <MaterialCommunityIcons name={item.icon || 'home-automation'} size={28} color={theme.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name}</Text>
          <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.nodes.length} Adım • {totalMinutes} Dakika
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 }}>
            <TouchableOpacity onPress={() => router.push(`/automation-builder?id=${item.id}`)}>
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>DÜZENLE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteScenario(item.id)}>
              <Text style={{ color: theme.warn, fontSize: 13, fontWeight: '700' }}>SİL</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!isRunning ? (
          <TouchableOpacity style={styles.playBtn} onPress={() => handlePlay(item.id)}>
            <MaterialCommunityIcons name="play-circle-outline" size={36} color={theme.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.playBtn}>
            <MaterialCommunityIcons name="animation-play" size={36} color={theme.primary} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Senaryolar & Otomasyon</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Klimanızı akıllıca programlayın</Text>
      </View>

      <View style={styles.listContainer}>
        {renderActiveSession()}
        
        {store.scenarios.length === 0 && !store.activeSession ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="robot-outline" size={64} color={theme.border} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Henüz bir otomasyon oluşturmadınız.</Text>
          </View>
        ) : (
          <FlashList
            data={store.scenarios}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
            contentContainerStyle={{ paddingBottom: 180, paddingHorizontal: Spacing.four }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <View style={[styles.fabContainer, { bottom: insets.bottom + 90 }]}>
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={() => router.push('/automation-builder')}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
          <Text style={styles.fabText}>Yeni Otomasyon Oluştur</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  listContainer: {
    flex: 1,
  },
  activeCard: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  stopBtn: {
    padding: 4,
  },
  activeNodeBox: {
    padding: 12,
    borderRadius: Radius.md,
  },
  nodeStep: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  nodeState: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: Spacing.three,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
  },
  playBtn: {
    padding: Spacing.two,
  },
  fabContainer: {
    position: 'absolute',
    alignSelf: 'center',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    ...Shadows.floating,
    gap: 8,
  },
  fabText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  }
});
