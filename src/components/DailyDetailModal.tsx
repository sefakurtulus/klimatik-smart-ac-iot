import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';
import { BarChart } from 'react-native-gifted-charts';

interface DailyDetailModalProps {
  data: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DailyDetailModal: React.FC<DailyDetailModalProps> = ({ data, isOpen, onClose }) => {
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  if (!isOpen || !data) return null;

  // Mock missing data for UI completeness based on actual daily kwh
  const mockHourlyData = [];
  for (let i = 0; i < 24; i += 3) {
    mockHourlyData.push({
      value: data.kwh > 0 ? Number((Math.random() * (data.kwh / 5)).toFixed(2)) : 0,
      label: `${i.toString().padStart(2, '0')}:00`,
      frontColor: theme.primary,
    });
  }

  const modeDistribution = data.modeDistribution || { cooling: 0, fan: 0, dehumidify: 0 };
  const tier1Kwh = Math.min(data.kwh, 6).toFixed(1);
  const tier2Kwh = Math.max(0, data.kwh - 6).toFixed(1);
  
  const tier1Rate = store.dusukTarifeFiyat;
  const tier2Rate = store.yuksekTarifeFiyat;
  
  const tier1Cost = (Number(tier1Kwh) * tier1Rate).toFixed(2);
  const tier2Cost = (Number(tier2Kwh) * tier2Rate).toFixed(2);

  const co2 = (data.kwh * 0.42).toFixed(1);

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: '#0f172a' }]}>
          
          <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.badge, { backgroundColor: 'rgba(56, 189, 248, 0.1)', borderColor: 'rgba(56, 189, 248, 0.3)' }]}>
                  <Text style={[styles.badgeText, { color: '#38bdf8' }]}>GÜNLÜK DETAYLI RAPOR</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>{data.dayName}</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 4 }}>
                {data.dateDisplay}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            <View style={styles.grid}>
              <View style={[styles.metricCard, { backgroundColor: '#172136', borderColor: '#24334f' }]}>
                <View style={styles.metricTitleRow}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color="#38bdf8" />
                  <Text style={styles.metricTitle}>Çalışma</Text>
                </View>
                <Text style={styles.metricValue}>{data.workingHoursFormatted}</Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: '#172136', borderColor: '#24334f' }]}>
                <View style={styles.metricTitleRow}>
                  <MaterialCommunityIcons name="lightning-bolt" size={14} color="#fbbf24" />
                  <Text style={styles.metricTitle}>Tüketim</Text>
                </View>
                <Text style={styles.metricValue}>{data.kwh} <Text style={styles.metricUnit}>kWh</Text></Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: '#172136', borderColor: '#24334f' }]}>
                <View style={styles.metricTitleRow}>
                  <MaterialCommunityIcons name="wallet-outline" size={14} color="#34d399" />
                  <Text style={styles.metricTitle}>Maliyet</Text>
                </View>
                <Text style={[styles.metricValue, { color: '#34d399' }]}>{data.costTL} <Text style={[styles.metricUnit, { color: 'rgba(52, 211, 153, 0.8)' }]}>TL</Text></Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: '#172136', borderColor: '#24334f' }]}>
                <View style={styles.metricTitleRow}>
                  <MaterialCommunityIcons name="shield-check" size={14} color="#38bdf8" />
                  <Text style={styles.metricTitle}>Verim Skoru</Text>
                </View>
                <Text style={[styles.metricValue, { color: '#38bdf8' }]}>{data.efficiencyScore}<Text style={styles.metricUnit}>/100</Text></Text>
              </View>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: '#141e30', borderColor: '#21304a' }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="lightning-bolt" size={16} color="#38bdf8" />
                  <Text style={styles.sectionTitle}>24 Saatlik Tüketim & Sıcaklık Eğrisi</Text>
                </View>
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>Saatlik kWh Dağılımı</Text>
              </View>
              
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                <BarChart
                  data={mockHourlyData}
                  width={Dimensions.get('window').width - 90}
                  height={140}
                  barWidth={18}
                  spacing={12}
                  roundedTop
                  hideRules
                  xAxisThickness={1}
                  yAxisThickness={1}
                  yAxisTextStyle={{ color: '#64748b', fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: '#64748b', fontSize: 10 }}
                  yAxisColor="#64748b"
                  xAxisColor="#64748b"
                  noOfSections={4}
                />
              </View>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: '#141e30', borderColor: '#21304a' }]}>
              <View style={[styles.sectionHeader, { marginBottom: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="snowflake" size={16} color="#38bdf8" />
                  <Text style={styles.sectionTitle}>Çalışma Modları Dağılımı</Text>
                </View>
              </View>

              <View style={{ gap: 12 }}>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="snowflake" size={14} color="#38bdf8" />
                      <Text style={{ fontSize: 12, color: '#cbd5e1' }}>Soğutma Modu</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#38bdf8' }}>%{modeDistribution.cooling}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${modeDistribution.cooling}%`, backgroundColor: '#38bdf8' }]} />
                  </View>
                </View>

                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="weather-windy" size={14} color="#34d399" />
                      <Text style={{ fontSize: 12, color: '#cbd5e1' }}>Fan Modu</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#34d399' }}>%{modeDistribution.fan}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${modeDistribution.fan}%`, backgroundColor: '#34d399' }]} />
                  </View>
                </View>

                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="water-percent" size={14} color="#818cf8" />
                      <Text style={{ fontSize: 12, color: '#cbd5e1' }}>Nem Alım Modu</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#818cf8' }}>%{modeDistribution.dehumidify}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${modeDistribution.dehumidify}%`, backgroundColor: '#818cf8' }]} />
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: '#141e30', borderColor: '#21304a' }]}>
              <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="wallet-outline" size={16} color="#34d399" />
                  <Text style={styles.sectionTitle}>Kademeli Tarife Hesaplama Detayı</Text>
                </View>
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>EPDK Tarifesi</Text>
              </View>

              <View style={{ gap: 8 }}>
                <View style={styles.tariffRow}>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: 13 }}>1. Kademe (Düşük Tarife)</Text>
                    <Text style={{ fontSize: 10, color: '#94a3b8' }}>{tier1Rate} TL/kWh • İlk 6 kWh</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 13 }}>{tier1Kwh} kWh</Text>
                    <Text style={{ fontWeight: '600', color: '#34d399', fontSize: 11 }}>{tier1Cost} TL</Text>
                  </View>
                </View>

                <View style={styles.tariffRow}>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: 13 }}>2. Kademe (Yüksek Tarife)</Text>
                    <Text style={{ fontSize: 10, color: '#94a3b8' }}>{tier2Rate} TL/kWh • 6 kWh üstü</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 13 }}>{tier2Kwh} kWh</Text>
                    <Text style={{ fontWeight: '600', color: '#fbbf24', fontSize: 11 }}>{tier2Cost} TL</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                  <Text style={{ fontWeight: 'bold', color: '#cbd5e1', fontSize: 14 }}>Net Toplam Tutar</Text>
                  <Text style={{ fontWeight: 'bold', color: '#34d399', fontSize: 16 }}>{data.costTL} TL</Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={[styles.smallCard, { backgroundColor: '#141e30', borderColor: '#21304a' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  <MaterialCommunityIcons name="fire" size={14} color="#fbbf24" />
                  <Text style={{ fontSize: 10, fontWeight: '500', color: '#94a3b8' }}>En Yoğun Kullanım</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#fde047' }}>14:00 - 17:00</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Diğer saatlere göre %35 fazla</Text>
              </View>

              <View style={[styles.smallCard, { backgroundColor: '#141e30', borderColor: '#21304a' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  <MaterialCommunityIcons name="leaf" size={14} color="#34d399" />
                  <Text style={{ fontSize: 10, fontWeight: '500', color: '#94a3b8' }}>Karbon Ayak İzi</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#34d399' }}>{co2} kg CO2</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Eko mod ile korundu</Text>
              </View>
            </View>

            <View style={[styles.aiBox, { backgroundColor: 'rgba(8, 51, 68, 0.5)', borderColor: 'rgba(6, 182, 212, 0.3)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MaterialCommunityIcons name="lightbulb-on" size={16} color="#22d3ee" />
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#22d3ee' }}>AI Analist Günlük Tavsiyesi</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 18 }}>
                {data.aiInsight}
              </Text>
            </View>

            <TouchableOpacity style={styles.shareBtn}>
              <MaterialCommunityIcons name="share-variant" size={16} color="#0f172a" />
              <Text style={styles.shareBtnText}>Raporu Paylaş / İndir</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  metricTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  metricTitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94a3b8',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  tariffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  smallCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  aiBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#06b6d4',
    paddingVertical: 14,
    borderRadius: 16,
  },
  shareBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 'bold',
  }
});
