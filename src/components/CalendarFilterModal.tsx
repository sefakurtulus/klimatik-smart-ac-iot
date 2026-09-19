import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';

interface CalendarFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  dailyDataList: any[];
}

export const CalendarFilterModal: React.FC<CalendarFilterModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onSelectDate,
  dailyDataList,
}) => {
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];
  
  const todayDate = new Date();
  
  const getMonthName = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const formatYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const getShortDayMonth = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const currentMonthStr = getMonthName(currentMonthDate);
  const [tempSelectedDate, setTempSelectedDate] = useState(selectedDate || formatYMD(todayDate));
  const [preset, setPreset] = useState('all');

  if (!isOpen) return null;

  // Generate days for current view
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // JS getDay() is 0 for Sunday. We want Monday=0
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const data = dailyDataList.find(d => d.date === dateStr);
    return { dayNum, dateStr, data };
  });

  const prevMonth = () => {
    const prev = new Date(currentMonthDate);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonthDate(prev);
  };

  const nextMonth = () => {
    const next = new Date(currentMonthDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonthDate(next);
  };

  const handleApply = () => {
    onSelectDate(tempSelectedDate);
    onClose();
  };

  const matchedData = dailyDataList.find(d => d.date === tempSelectedDate);

  return (
    <Modal visible={isOpen} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: '#121a2d' }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.headerIconBg}>
                <MaterialCommunityIcons name="calendar-month" size={24} color="#22d3ee" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Geçmiş Veri & Takvim Filtresi</Text>
                <Text style={styles.headerSubtitle}>Tüketim analizleri için gün veya aralık seçin</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Presets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 16 }}>
            <View style={styles.presetContainer}>
              {[
                { id: 'today', label: `Bugün (${getShortDayMonth(todayDate)})` },
                { id: 'yesterday', label: `Dün (${getShortDayMonth(new Date(todayDate.getTime() - 86400000))})` },
                { id: 'this_week', label: 'Bu Hafta' },
                { id: 'all', label: 'Tüm Günler' },
              ].map((p) => {
                const isActive = preset === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.presetBtn,
                      isActive ? { backgroundColor: '#06b6d4' } : { backgroundColor: 'rgba(30,41,59,0.6)', borderColor: 'rgba(51,65,85,0.5)', borderWidth: 1 }
                    ]}
                    onPress={() => {
                      setPreset(p.id);
                      if (p.id === 'today') setTempSelectedDate(formatYMD(todayDate));
                      if (p.id === 'yesterday') setTempSelectedDate(formatYMD(new Date(todayDate.getTime() - 86400000)));
                    }}
                  >
                    <Text style={[styles.presetText, isActive ? { color: '#0f172a', fontWeight: 'bold' } : { color: '#cbd5e1' }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Month Selector */}
          <View style={styles.monthSelector}>
            <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
              <MaterialCommunityIcons name="chevron-left" size={20} color="#94a3b8" />
            </TouchableOpacity>
            <Text style={styles.monthText}>{currentMonthStr}</Text>
            <TouchableOpacity style={styles.monthBtn} onPress={nextMonth}>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarContainer}>
            <View style={styles.weekDays}>
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d, i) => (
                <Text key={i} style={styles.weekDayText}>{d}</Text>
              ))}
            </View>
            
            <View style={styles.daysGrid}>
              {Array.from({ length: offset }).map((_, i) => (
                <View key={`offset-${i}`} style={styles.dayBox} />
              ))}

              {days.map((day) => {
                const isSelected = tempSelectedDate === day.dateStr;
                const hasData = !!day.data;
                
                return (
                  <TouchableOpacity
                    key={day.dayNum}
                    style={[
                      styles.dayBox,
                      isSelected ? { backgroundColor: '#06b6d4', shadowColor: '#00d2ff', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 } : 
                      hasData ? { backgroundColor: 'rgba(30,41,59,0.8)', borderColor: 'rgba(51,65,85,0.6)', borderWidth: 1 } :
                      { backgroundColor: 'rgba(15,23,42,0.4)' }
                    ]}
                    onPress={() => setTempSelectedDate(day.dateStr)}
                  >
                    <Text style={[
                      styles.dayNum,
                      isSelected ? { color: '#0f172a', fontWeight: '900' } :
                      hasData ? { color: '#fff' } :
                      { color: '#64748b' }
                    ]}>
                      {day.dayNum}
                    </Text>
                    
                    {hasData && (
                      <View style={[styles.dot, isSelected ? { backgroundColor: '#0f172a' } : { backgroundColor: '#34d399' }]} />
                    )}
                    
                    {hasData && (
                      <Text style={[styles.dayKwh, isSelected ? { color: 'rgba(15,23,42,0.8)' } : { color: '#94a3b8' }]}>
                        {day.data.kwh}kW
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Selected Preview */}
          <View style={{ marginTop: 16 }}>
            {matchedData ? (
              <View style={styles.previewCard}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="check" size={16} color="#34d399" />
                    <Text style={{ fontWeight: 'bold', color: '#fff' }}>{matchedData.dateDisplay}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {matchedData.workingHoursFormatted} çalışma • {matchedData.kwh} kWh
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: 'bold', color: '#34d399', fontSize: 16 }}>{matchedData.costTL} TL</Text>
                  <Text style={{ fontSize: 10, color: '#22d3ee' }}>Verim: {matchedData.efficiencyScore}/100</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.previewCard, { justifyContent: 'center', backgroundColor: 'rgba(30,41,59,0.6)', borderColor: 'rgba(51,65,85,0.5)' }]}>
                <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Seçilen tarih için henüz kayıtlı tüketim verisi bulunmuyor.</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.resetBtn} onPress={() => { setPreset('all'); setTempSelectedDate(''); }}>
              <MaterialCommunityIcons name="reload" size={16} color="#cbd5e1" />
              <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '500' }}>Filtreyi Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: 'bold' }}>Filtreyi Uygula</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,1)',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,65,85,1)',
  },
  headerIconBg: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(6,182,212,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.2)',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
  presetContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  presetText: {
    fontSize: 11,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,1)',
    marginTop: 16,
  },
  monthBtn: {
    padding: 4,
    borderRadius: 8,
  },
  monthText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#22d3ee',
  },
  calendarContainer: {
    marginTop: 16,
    backgroundColor: 'rgba(15,23,42,0.5)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.8)',
  },
  weekDays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayBox: {
    width: '14.28%', // 100/7
    aspectRatio: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    padding: 2,
    marginBottom: 4,
  },
  dayNum: {
    fontSize: 12,
    fontWeight: '600',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  dayKwh: {
    fontSize: 7,
    marginTop: 2,
  },
  previewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(8,51,68,0.3)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.3)',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: 'rgba(30,41,59,1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,1)',
  },
  applyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#06b6d4',
    borderRadius: 16,
  }
});
