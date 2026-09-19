import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';

export default function Home() {
  const insets = useSafeAreaInsets();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  const tempScale = useSharedValue(1);
  const prevTranslationY = useSharedValue(0);

  const [showWeatherModal, setShowWeatherModal] = useState(false);

  const [localState, setLocalState] = useState({
    isOn: store.isOn,
    targetTemp: store.targetTemp,
    mode: store.mode,
    fanSpeed: store.fanSpeed,
    swing: store.swing,
  });

  const [todayStats, setTodayStats] = useState({ kwh: '0.0', cost: '0.0' });

  // Store değiştiğinde (Firebase'den veya initial load) localState'i güncelle
  useEffect(() => {
    setLocalState({
      isOn: store.isOn,
      targetTemp: store.targetTemp,
      mode: store.mode,
      fanSpeed: store.fanSpeed,
      swing: store.swing,
    });
  }, [store.isOn, store.targetTemp, store.mode, store.fanSpeed, store.swing]);

  useEffect(() => {
    if (store.activeDeviceId) {
      store.initFirebaseListener();
    }
  }, [store.activeDeviceId]);

  useEffect(() => {
    store.fetchWeather();

    // Fetch today's consumption
    import('@/services/firebaseService').then(({ fetchMonthlyAcLogs }) => {
      const now = new Date();
      const yearMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      fetchMonthlyAcLogs(yearMonthStr).then(logs => {
        let energyKwh = 0;
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfDay = startOfDay + 86400000;
        
        for (let i = 0; i < logs.length; i++) {
          const log = logs[i];
          if (!log.timestamp) continue;
          
          let logDate = new Date();
          if (log.timestamp.toDate) logDate = log.timestamp.toDate();
          else if (log.timestamp.seconds) logDate = new Date(log.timestamp.seconds * 1000);
          else logDate = new Date(log.timestamp);
          
          if (logDate.getTime() >= startOfDay && logDate.getTime() < endOfDay) {
            let nextDate = new Date();
            if (i + 1 < logs.length && logs[i + 1].timestamp) {
              const nextLog = logs[i + 1];
              if (nextLog.timestamp.toDate) nextDate = nextLog.timestamp.toDate();
              else if (nextLog.timestamp.seconds) nextDate = new Date(nextLog.timestamp.seconds * 1000);
              else nextDate = new Date(nextLog.timestamp);
            }
            
            let diffMins = Math.max(0, Math.round((nextDate.getTime() - logDate.getTime()) / 60000));
            if (diffMins > 12 * 60) diffMins = 12 * 60; // 12 hrs failsafe
            
            if (log.payload.power) {
               // Roughly 0.02 kWh per minute
               energyKwh += diffMins * 0.02;
            }
          }
        }
        setTodayStats({ 
          kwh: energyKwh.toFixed(1),
          cost: (energyKwh * store.dusukTarifeFiyat).toFixed(1)
        });
      });
    });
  }, []);

  const applyTempDelta = (delta: number) => {
    if (localState.mode === 'Fan') return;
    setLocalState(prev => ({
      ...prev,
      isOn: true,
      targetTemp: Math.min(30, Math.max(18, prev.targetTemp + delta))
    }));
  };

  const applyTempExact = (temp: number) => {
    if (localState.mode === 'Fan') return;
    setLocalState(prev => {
      if (prev.targetTemp !== temp || !prev.isOn) {
        return { ...prev, isOn: true, targetTemp: temp };
      }
      return prev;
    });
  };

  const calculateTempFromGesture = (x: number, y: number) => {
    'worklet';
    // Center of 280x280 circle is at (140, 140)
    let angle = Math.atan2(y - 140, x - 140) * (180 / Math.PI);
    let progress = 0;
    if (angle >= 0 && angle <= 90) progress = 1;
    else if (angle > 90 && angle <= 180) progress = 0;
    else progress = (angle + 180) / 180; // -180 to 0 mapped to 0 to 1
    return Math.round(18 + progress * 12);
  };

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      tempScale.value = withSpring(1.05);
      runOnJS(applyTempExact)(calculateTempFromGesture(e.x, e.y));
    })
    .onUpdate((e) => {
      runOnJS(applyTempExact)(calculateTempFromGesture(e.x, e.y));
    })
    .onEnd(() => {
      tempScale.value = withSpring(1);
    });

  const animatedCircleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: tempScale.value }],
    };
  });

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = (localState.targetTemp - 18) / 12;
    const deg = -90 + (progress * 180);
    return {
      transform: [{ rotate: `${deg}deg` }],
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.four, paddingBottom: 140 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={[styles.iconBox, { backgroundColor: theme.backgroundElement }]}
              onPress={() => store.setActiveDeviceId(null)}
            >
              <MaterialCommunityIcons name="home-variant" size={24} color={theme.text} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {store.devices.find(d => d.id === store.activeDeviceId)?.name || 'Cihaz'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: store.isOnline ? theme.success : theme.error }]}>
                {store.isOnline ? 'ESP Online' : 'ESP Offline'}
              </Text>
            </View>
          </View>
          
          <View style={styles.headerRightContainer}>
            <View style={[styles.headerRight, { 
              backgroundColor: store.isOnline ? `${theme.success}1A` : `${theme.error}1A`,
              borderColor: store.isOnline ? `${theme.success}4D` : `${theme.error}4D`
            }]}>
              <MaterialCommunityIcons 
                name={store.isOnline ? "wifi" : "wifi-off"} 
                size={20} 
                color={store.isOnline ? theme.success : theme.error} 
              />
            </View>
          </View>
        </View>

        {/* Weather & Room Temp Info */}
        <View style={styles.weatherContainer}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => store.fetchWeather()}
            onLongPress={() => setShowWeatherModal(true)}
            style={[styles.weatherCard, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.border }]}
          >
            <View style={styles.weatherCardHeader}>
              <MaterialCommunityIcons name="white-balance-sunny" size={16} color={theme.warn} />
              <Text style={[styles.weatherLabel, { color: theme.textSecondary }]}>Dışarısı</Text>
            </View>
            <View style={styles.weatherValueRow}>
              <Text style={[styles.weatherValue, { color: theme.text }]}>
                {store.weather.loading ? '--' : store.weather.temp}
              </Text>
              <Text style={[styles.weatherUnit, { color: theme.textSecondary }]}>°</Text>
            </View>
            <Text style={[styles.weatherSub, { color: theme.textSecondary }]}>
              {store.weather.loading ? 'Yenileniyor...' : `Nem %${store.weather.humidity || '--'} · ${store.weather.description ? store.weather.description.charAt(0).toUpperCase() + store.weather.description.slice(1) : ''}`}
            </Text>
          </TouchableOpacity>
          
          <View style={[styles.weatherCard, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.border }]}>
            <View style={styles.weatherCardHeader}>
              <MaterialCommunityIcons name="water-outline" size={16} color={theme.primary} />
              <Text style={[styles.weatherLabel, { color: theme.textSecondary }]}>Oda Sensörü</Text>
            </View>
            <View style={styles.weatherValueRow}>
              <Text style={[styles.weatherValue, { color: theme.text }]}>
                {store.roomTemp !== null ? Math.round(store.roomTemp) : '--'}
              </Text>
              <Text style={[styles.weatherUnit, { color: theme.textSecondary }]}>°</Text>
            </View>
            <Text style={[styles.weatherSub, { color: theme.textSecondary }]}>
              Nem %52 · Canlı veri
            </Text>
          </View>
        </View>

        {/* Thermostat Ring */}
        <View style={[styles.thermostatCardV0, { borderColor: theme.border }]}>
          <View style={styles.thermostatContainer}>
            <GestureDetector gesture={gesture}>
              <Animated.View style={[
                styles.thermostatRing,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: localState.isOn ? theme.primary : 'rgba(255,255,255,0.08)',
                  shadowColor: localState.isOn ? theme.primary : 'transparent',
                },
                animatedCircleStyle
              ]}>
              <Animated.View style={[StyleSheet.absoluteFill, indicatorStyle, { alignItems: 'center' }]}>
                <View style={{
                  marginTop: -10,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#FFF',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 5
                }} />
              </Animated.View>

              <View style={[styles.thermostatInner, { backgroundColor: 'transparent' }]}>
                <Text style={[styles.thermostatLabel, { color: theme.textSecondary }]}>Hedef Sıcaklık</Text>
                <View style={styles.tempRow}>
                  <Text style={[styles.targetTemp, { color: theme.text, opacity: localState.mode === 'Fan' ? 0.3 : 1 }]}>
                    {localState.targetTemp}
                  </Text>
                  <Text style={[styles.targetTempUnit, { color: theme.primary }]}>°</Text>
                </View>
                <View style={styles.modeIndicator}>
                  <MaterialCommunityIcons 
                    name={localState.mode === 'Cool' ? 'snowflake' : localState.mode === 'Heat' ? 'fire' : localState.mode === 'Dry' ? 'water' : localState.mode === 'Fan' ? 'fan' : 'brightness-auto'} 
                    size={16} 
                    color={theme.primary} 
                  />
                  <Text style={[styles.currentTemp, { color: theme.primary, marginTop: 0 }]}>
                    {localState.mode === 'Cool' ? 'Soğutma' : localState.mode === 'Heat' ? 'Isıtma' : localState.mode === 'Dry' ? 'Nem Alma' : localState.mode === 'Fan' ? 'Fan' : 'Otomatik'}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>

          {/* Plus / Minus Buttons Under Ring */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.circleBtn}
              disabled={localState.mode === 'Fan'}
              onPress={() => applyTempDelta(-1)}>
              <MaterialCommunityIcons name="minus" size={24} color={localState.mode === 'Fan' ? theme.border : theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtnActive, { borderColor: `${theme.primary}66`, backgroundColor: `${theme.primary}1A` }]}
              disabled={localState.mode === 'Fan'}
              onPress={() => applyTempDelta(1)}>
              <MaterialCommunityIcons name="plus" size={24} color={localState.mode === 'Fan' ? theme.border : theme.primary} />
            </TouchableOpacity>
          </View>
        </View>
        </View>

        {/* Apply Button moved under the thermostat */}
        <View style={styles.applyButtonContainer}>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: theme.primary }]}
            onPress={() => store.applyAndSync(localState)}
          >
            <MaterialCommunityIcons name="send" size={24} color="#FFF" />
            <Text style={styles.applyButtonText}>Ayarları Uygula</Text>
          </TouchableOpacity>
        </View>

        {/* Power & Modes (Grid) */}
        <View style={styles.powerModeGrid}>
          <TouchableOpacity
            style={[
              styles.powerButtonV0,
              { 
                backgroundColor: localState.isOn ? `${theme.primary}1A` : 'rgba(255,255,255,0.03)',
                borderColor: localState.isOn ? `${theme.primary}66` : 'rgba(255,255,255,0.08)'
              }
            ]}
            onPress={() => setLocalState(prev => ({ ...prev, isOn: !prev.isOn }))}
          >
            <View style={[styles.powerIconWrapper, { backgroundColor: localState.isOn ? theme.primary : theme.textSecondary }]}>
              <MaterialCommunityIcons name="power" size={20} color={localState.isOn ? '#000' : '#FFF'} />
            </View>
            <View>
              <Text style={[styles.powerBtnText, { color: theme.text }]}>{localState.isOn ? 'Açık' : 'Kapalı'}</Text>
              <Text style={[styles.powerBtnSub, { color: theme.textSecondary }]}>Güç</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.powerButtonV0,
              { 
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderColor: 'rgba(255,255,255,0.08)'
              }
            ]}
            // Fan speed toggle logic is handled below, but this is a quick shortcut
          >
            <View style={[styles.powerIconWrapper, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
              <MaterialCommunityIcons name="weather-windy" size={20} color={theme.textSecondary} />
            </View>
            <View>
              <Text style={[styles.powerBtnText, { color: theme.text }]}>{localState.fanSpeed === 'Auto' ? 'Oto' : localState.fanSpeed}</Text>
              <Text style={[styles.powerBtnSub, { color: theme.textSecondary }]}>Fan Hızı</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Mode Selector Row */}
        <View style={styles.modeRowV0}>
          {[
            { id: 'Cool', label: 'Soğutma', icon: 'snowflake' },
            { id: 'Heat', label: 'Isıtma', icon: 'fire' },
            { id: 'Fan', label: 'Fan', icon: 'fan' },
            { id: 'Dry', label: 'Nem Al', icon: 'water' }
          ].map((m) => {
            const isActive = localState.mode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.modeBoxV0,
                  {
                    backgroundColor: isActive ? `${theme.primary}1A` : 'rgba(255,255,255,0.03)',
                    borderColor: isActive ? `${theme.primary}66` : 'rgba(255,255,255,0.08)'
                  }
                ]}
                onPress={() => setLocalState(prev => ({ ...prev, mode: m.id as any, ...(m.id === 'Dry' ? { fanSpeed: 'Auto' } : {}) }))}
              >
                <MaterialCommunityIcons name={m.icon as any} size={20} color={isActive ? theme.primary : theme.textSecondary} />
                <Text style={[
                  styles.modeTextV0,
                  { color: isActive ? theme.text : theme.textSecondary }
                ]}>{m.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Fan Speed */}
        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Fan Hızı</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
            {(['Auto', '1', '2', '3', 'Turbo'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                disabled={localState.mode === 'Dry'}
                style={[
                  styles.modePill,
                  {
                    backgroundColor: localState.fanSpeed === f ? `${theme.primary}1A` : 'rgba(255,255,255,0.03)',
                    borderColor: localState.fanSpeed === f ? `${theme.primary}66` : 'rgba(255,255,255,0.08)',
                    opacity: localState.mode === 'Dry' ? 0.5 : 1
                  }
                ]}
                onPress={() => setLocalState(prev => ({ ...prev, fanSpeed: f }))}
              >
                <Text style={[
                  styles.modeText,
                  { color: localState.fanSpeed === f ? theme.primary : theme.textSecondary }
                ]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Swing */}
        <View style={styles.settingContainer}>
          <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Kanatçık / Swing</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
            {(['Off', 'On'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.modePill,
                  {
                    backgroundColor: localState.swing === s ? `${theme.primary}1A` : 'rgba(255,255,255,0.03)',
                    borderColor: localState.swing === s ? `${theme.primary}66` : 'rgba(255,255,255,0.08)'
                  }
                ]}
                onPress={() => setLocalState(prev => ({ ...prev, swing: s }))}
              >
                <Text style={[
                  styles.modeText,
                  { color: localState.swing === s ? theme.primary : theme.textSecondary }
                ]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* High Humidity Warning */}
        {store.weather.humidity && store.weather.humidity > 70 && (
          <View style={[styles.warningCard, { backgroundColor: `${theme.accent}15`, borderColor: theme.accent }]}>
            <MaterialCommunityIcons name="water-percent" size={24} color={theme.accent} />
            <Text style={[styles.warningText, { color: theme.text }]}>
              Dışarıda yüksek nem var, ortamı soğutmadan ferahlamak için Dry (Nem Alma) modunu öneririm.
            </Text>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Hızlı İşlemler</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionScroll}>
            <ActionPill icon="weather-night" label="Sleep" active={store.sleep} onPress={store.toggleSleep} theme={theme} />
            <ActionPill icon="rocket-launch" label="Turbo" active={store.turbo} onPress={store.toggleTurbo} theme={theme} />
          </ScrollView>
        </View>

        {/* Info Cards */}
        <View style={styles.cardsGrid}>
          <InfoCard
            title="Klima"
            value={localState.isOn ? 'Açık' : 'Kapalı'}
            subtitle={`${localState.targetTemp}°   ${localState.mode}`}
            icon="air-conditioner"
            theme={theme}
          />
          <InfoCard
            title="Bugün Tüketim"
            value={`${todayStats.kwh} kWh`}
            subtitle={`~ ${todayStats.cost} TL`}
            icon="lightning-bolt"
            theme={theme}
          />
          <InfoCard
            title="Oda Durumu"
            value={store.roomTemp !== null && store.roomTemp !== undefined ? `${Math.round(store.roomTemp)}°C` : '--'}
            subtitle={`Nem: ${store.weather.humidity || 0}%`}
            icon="home-thermometer"
            theme={theme}
          />
          <InfoCard
            title="ESP Durumu"
            value={store.isOnline ? 'Bağlı' : 'Koptu'}
            subtitle={store.isOnline ? 'Bağlantı Açık' : 'Devre Dışı'}
            icon="lan"
            theme={theme}
          />
        </View>

        {/* Weather Modal */}
        <Modal visible={showWeatherModal} transparent animationType="fade">
          <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: '#161D27', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 }]}>
              <View style={styles.modalHeaderV0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ backgroundColor: `${theme.primary}1A`, padding: 6, borderRadius: 12 }}>
                    <MaterialCommunityIcons name="weather-partly-cloudy" size={20} color={theme.primary} />
                  </View>
                  <Text style={[styles.modalTitleV0, { color: theme.text }]}>Hava Durumu Detayı</Text>
                </View>
                <TouchableOpacity onPress={() => setShowWeatherModal(false)} style={styles.closeBtnV0}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalDivider} />
              
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <View>
                  <Text style={{ color: theme.text, fontSize: 36, fontWeight: 'bold' }}>{store.weather.temp}°C</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Hissedilen: {store.weather.feelsLike}°C</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <MaterialCommunityIcons name="white-balance-sunny" size={32} color={theme.warn} />
                  <Text style={{ color: theme.text, fontSize: 14, marginTop: 4, textTransform: 'capitalize' }}>{store.weather.description}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginBottom: 20 }}>
                <View style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="water-percent" size={20} color={theme.primary} />
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Nem</Text>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: 'bold' }}>%{store.weather.humidity}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="weather-windy" size={20} color="#a0aec0" />
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Rüzgar</Text>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: 'bold' }}>{store.weather.windSpeed} km/h</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.danger} />
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Konum</Text>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: 'bold' }}>Serdivan</Text>
                </View>
              </View>

              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>Saatlik Tahmin</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {store.weather.hourly?.map((hr: any, idx: number) => (
                  <View key={idx} style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 12, marginRight: 10, minWidth: 60 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>{hr.time}</Text>
                    <MaterialCommunityIcons name="cloud-outline" size={20} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: 'bold', marginTop: 4 }}>{hr.temp}°</Text>
                    {hr.prob > 0 && <Text style={{ color: theme.primary, fontSize: 10, marginTop: 2 }}>%{hr.prob}</Text>}
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity onPress={() => store.fetchWeather()} style={[styles.saveBtnV0, { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 15 }}>{store.weather.loading ? 'Yenileniyor...' : 'Yenile'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

function ActionPill({ icon, label, active, onPress, theme }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.actionPill,
        {
          backgroundColor: active ? `${theme.primary}20` : theme.backgroundElement,
          borderColor: active ? theme.primary : theme.border,
        }
      ]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? theme.primary : theme.textSecondary} />
      <Text style={[styles.actionLabel, { color: active ? theme.primary : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoCard({ title, value, subtitle, icon, theme }: any) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name={icon} size={24} color={theme.primary} />
        <Text style={[styles.cardTitle, { color: theme.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
      </View>
      <Text style={[styles.cardValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.six,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'sans',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.7,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  changeDeviceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.six,
  },
  weatherCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  weatherCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  weatherLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  weatherValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weatherValue: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'mono',
  },
  weatherUnit: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  weatherSub: {
    fontSize: 11,
    marginTop: 4,
  },
  thermostatCardV0: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingVertical: 12,
    marginBottom: Spacing.six,
    alignItems: 'center',
  },
  thermostatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.six,
  },
  thermostatRing: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 20,
  },
  thermostatInner: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thermostatLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  targetTemp: {
    fontSize: 72,
    fontWeight: '700',
    fontFamily: 'mono',
    letterSpacing: -2,
  },
  targetTempUnit: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 10,
    fontFamily: 'mono',
  },
  modeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  currentTemp: {
    fontSize: 13,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 8,
  },
  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnActive: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerModeGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  powerButtonV0: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  powerIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  powerBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },
  modeRowV0: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.six,
  },
  modeBoxV0: {
    width: '47%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  modeTextV0: {
    fontSize: 12,
    fontWeight: '600',
  },
  modeScroll: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
  },
  modePill: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingContainer: {
    marginBottom: Spacing.six,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  quickActions: {
    marginBottom: Spacing.six,
  },
  quickActionScroll: {
    gap: Spacing.three,
    paddingRight: Spacing.four,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.six,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  infoCard: {
    width: '47%',
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  applyButtonContainer: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.six,
    marginTop: Spacing.two,
    width: '100%',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: Radius.xl,
    ...Shadows.floating,
    gap: 12,
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', padding: 20, borderRadius: 24 },
  modalHeaderV0: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitleV0: { fontSize: 18, fontWeight: 'bold' },
  closeBtnV0: { padding: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)' },
  modalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: -20, marginBottom: 20 },
  saveBtnV0: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
});
