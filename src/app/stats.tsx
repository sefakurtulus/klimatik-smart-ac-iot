import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';
import { fetchMonthlyAcLogs, fetchLatestFilterLog, logFilterCleaning } from '@/services/firebaseService';
import DatePicker from '@dietime/react-native-date-picker';
import { BarChart } from 'react-native-gifted-charts';
import { DailyDetailModal } from '@/components/DailyDetailModal';
import { CalendarFilterModal } from '@/components/CalendarFilterModal';

// Donanım Sabitleri
const NOMINAL_POWER_KW = 1.05; // Samsung 12000 BTU
const ROLANTI_MULTIPLIER = 0.4;
const COLD_START_HOURS = 6;
const COLD_START_MINUTES = 30;
const FAILSAFE_HOURS = 12;

export default function Stats() {
  const insets = useSafeAreaInsets();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [totalWorkingMinutes, setTotalWorkingMinutes] = useState(0);
  const [calculatedEnergy, setCalculatedEnergy] = useState(0);
  const [calculatedCost, setCalculatedCost] = useState(0);
  const [filterDaysPassed, setFilterDaysPassed] = useState(20); // default
  const [activeDaysCount, setActiveDaysCount] = useState(1);
  const [dailyDataList, setDailyDataList] = useState<any[]>([]);
  
  // Filter Date Modal State (Filtre Temizleme)
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempFilterDate, setTempFilterDate] = useState(new Date());

  // New Modals State
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [selectedDailyData, setSelectedDailyData] = useState<any>(null);
  
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState('');

  // Week/Chart UI State
  const [viewMode, setViewMode] = useState<'chart' | 'cards'>('chart');
  const [quickFilter, setQuickFilter] = useState<'all' | 'high_kwh'>('all');
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  
  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [tempMonthly, setTempMonthly] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) {
      init[i] = (store.monthlyBaseConsumption?.[i] || 180).toString();
    }
    return init;
  });
  const [tempDusuk, setTempDusuk] = useState(store.dusukTarifeFiyat.toString());
  const [tempYuksek, setTempYuksek] = useState(store.yuksekTarifeFiyat.toString());

  const loadLogs = useCallback(async () => {
    setRefreshing(true);
    const yearMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    
    // Fetch logs concurrently
    const [fetchedLogs, latestFilterDate] = await Promise.all([
      fetchMonthlyAcLogs(yearMonthStr),
      fetchLatestFilterLog()
    ]);
    
    if (latestFilterDate) {
      const diffTime = Math.abs(new Date().getTime() - latestFilterDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setFilterDaysPassed(diffDays);
    } else {
      setFilterDaysPassed(99); // Veri yoksa kirli varsay
    }
    
    let minutes = 0;
    let energyKwh = 0;
    let isRunning = false;
    let lastPowerOffTime: Date | null = null;
    let fullPowerMinsLeft = 0;
    
    // Değişiklik: Sadece kwh değil, workingMinutes ve mode sürelerini de tutacağız
    const dailyStatsMap: Record<string, { 
      kwh: number, 
      workingMinutes: number,
      modeTimes: { cooling: number, fan: number, dehumidify: number } 
    }> = {};
    
    for (let i = 0; i < fetchedLogs.length; i++) {
      const log = fetchedLogs[i];
      if (!log.timestamp) continue;
      
      let logDate: Date;
      if (log.timestamp.toDate) {
         logDate = log.timestamp.toDate();
      } else if (log.timestamp.seconds) {
         logDate = new Date(log.timestamp.seconds * 1000);
      } else {
         logDate = new Date(log.timestamp);
      }
      
      let nextDate = new Date(); // Varsayılan olarak şu anki zaman
      if (i + 1 < fetchedLogs.length && fetchedLogs[i + 1].timestamp) {
        const nextLog = fetchedLogs[i + 1];
        if (nextLog.timestamp.toDate) nextDate = nextLog.timestamp.toDate();
        else if (nextLog.timestamp.seconds) nextDate = new Date(nextLog.timestamp.seconds * 1000);
        else nextDate = new Date(nextLog.timestamp);
      }
      
      let diffMins = Math.max(0, Math.round((nextDate.getTime() - logDate.getTime()) / 60000));
      
      // FAILSAFE: 12 saati aşan kesintisiz çalışma varsa 12 saatte kes
      if (diffMins > FAILSAFE_HOURS * 60) {
        diffMins = FAILSAFE_HOURS * 60;
        nextDate = new Date(logDate.getTime() + FAILSAFE_HOURS * 60 * 60000);
      }

      const isPowerOn = log.payload?.power === true;
      
      if (!isPowerOn) {
        isRunning = false;
        lastPowerOffTime = logDate;
        continue;
      }
      
      // Klima çalışıyor durumu
      if (!isRunning) {
        isRunning = true;
        const msSinceLastOff = lastPowerOffTime ? (logDate.getTime() - lastPowerOffTime.getTime()) : Infinity;
        // COLD START KONTROLÜ
        if (msSinceLastOff > COLD_START_HOURS * 60 * 60000) {
          fullPowerMinsLeft = COLD_START_MINUTES;
        } else {
          fullPowerMinsLeft = 0; // Oda hala serin
        }
      }
      
      // MOD VE DERECE ÇARPANLARI
      const mode = log.payload?.mode || 'Cool';
      const temp = log.payload?.temp || 24;
      let intervalEnergy = 0;
      
      if (mode === 'Fan') {
        // Fan modu: Kompresör kapalı, tüketim %15
        intervalEnergy = (diffMins / 60) * (NOMINAL_POWER_KW * 0.15);
        fullPowerMinsLeft = Math.max(0, fullPowerMinsLeft - diffMins); // Fan modunda geçen süre de cold start'tan yer
      } else {
        let tempMultiplier = 1.0;
        if (mode === 'Cool') {
          if (temp <= 22) tempMultiplier = 1.2;
          else if (temp >= 25) tempMultiplier = 0.8;
        }
        
        const fullMins = Math.min(diffMins, fullPowerMinsLeft);
        const idleMins = diffMins - fullMins;
        fullPowerMinsLeft -= fullMins;
        
        const energyFull = (fullMins / 60) * (NOMINAL_POWER_KW * 1.0 * tempMultiplier);
        const energyIdle = (idleMins / 60) * (NOMINAL_POWER_KW * ROLANTI_MULTIPLIER * tempMultiplier);
        
        intervalEnergy = energyFull + energyIdle;
      }
      
      const dayKey = logDate.toISOString().split('T')[0];
      if (!dailyStatsMap[dayKey]) {
        dailyStatsMap[dayKey] = { kwh: 0, workingMinutes: 0, modeTimes: { cooling: 0, fan: 0, dehumidify: 0 } };
      }
      
      dailyStatsMap[dayKey].kwh += intervalEnergy;
      dailyStatsMap[dayKey].workingMinutes += diffMins;
      
      if (mode === 'Fan') {
        dailyStatsMap[dayKey].modeTimes.fan += diffMins;
      } else if (mode === 'Dry' || mode === 'Nem Alma') {
        dailyStatsMap[dayKey].modeTimes.dehumidify += diffMins;
      } else {
        dailyStatsMap[dayKey].modeTimes.cooling += diffMins;
      }
      
      minutes += diffMins;
      energyKwh += intervalEnergy;
      
      // Eğer FAILSAFE devreye girdiyse, sürenin sonunda klima "unutulduğu için" kapanmış sayılır
      if (diffMins === FAILSAFE_HOURS * 60 && nextDate.getTime() < new Date().getTime()) {
         isRunning = false;
         lastPowerOffTime = nextDate;
      }
    }
    
    // Kademeli Tarife Maliyet Hesabı (Günlük Bazda)
    let totalMonthlyCost = 0;
    const currentMonthNumber = currentMonth.getMonth() + 1;
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonthNumber, 0).getDate();
    const monthlyBase = store.monthlyBaseConsumption?.[currentMonthNumber] || 180;
    const dailyBase = monthlyBase / daysInMonth;
    const dailyQuota = Math.max(0, 8 - dailyBase);
    
    const newDailyList: any[] = [];
    
    Object.keys(dailyStatsMap).forEach(day => {
      const { kwh, workingMinutes, modeTimes } = dailyStatsMap[day];
      
      let costTL = 0;
      if (kwh <= dailyQuota) {
        costTL = kwh * store.dusukTarifeFiyat;
      } else {
        costTL = dailyQuota * store.dusukTarifeFiyat;
        costTL += (kwh - dailyQuota) * store.yuksekTarifeFiyat;
      }
      totalMonthlyCost += costTL;
      
      // UI listesi için verileri hazırla
      const dayDate = new Date(day);
      const dateDisplay = dayDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const dayName = dayDate.toLocaleDateString('tr-TR', { weekday: 'long' });
      
      const hours = Math.floor(workingMinutes / 60);
      const mins = workingMinutes % 60;
      const workingHoursFormatted = `${hours}s ${mins}d`;
      
      const e_opt = (workingMinutes / 60) * (NOMINAL_POWER_KW * 0.40);
      let effScore = kwh > 0 ? Math.min(100, (e_opt / kwh) * 100) : 100;
      effScore = Math.max(0, Math.round(effScore));
      
      let insight = "İdeal tüketim.";
      if (effScore < 50) insight = "Tüketim yüksek, kapı ve pencereleri kontrol edin.";
      else if (effScore > 80) insight = "Çok verimli kullanıyorsunuz, tebrikler.";

      // Mode Yüzdelerini Hesapla
      let modeDist = { cooling: 0, fan: 0, dehumidify: 0 };
      if (workingMinutes > 0) {
        modeDist = {
          cooling: Math.round((modeTimes.cooling / workingMinutes) * 100),
          fan: Math.round((modeTimes.fan / workingMinutes) * 100),
          dehumidify: Math.round((modeTimes.dehumidify / workingMinutes) * 100)
        };
      }

      newDailyList.push({
        id: day,
        date: day,
        dateDisplay,
        dayName,
        kwh: Number(kwh.toFixed(1)),
        costTL: Number(costTL.toFixed(2)),
        workingMinutes,
        workingHoursFormatted,
        efficiencyScore: effScore,
        aiInsight: insight,
        modeDistribution: modeDist
      });
    });
    
    newDailyList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setDailyDataList(newDailyList);
    
    setTotalWorkingMinutes(minutes);
    setCalculatedEnergy(energyKwh);
    setCalculatedCost(totalMonthlyCost);
    setActiveDaysCount(Object.keys(dailyStatsMap).length || 1);
    setRefreshing(false);
  }, [currentMonth, store.monthlyBaseConsumption, store.dusukTarifeFiyat, store.yuksekTarifeFiyat]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const prevMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonth(prev);
  };

  const nextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonth(next);
  };

  const monthName = currentMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  const hours = Math.floor(totalWorkingMinutes / 60);
  const mins = totalWorkingMinutes % 60;
  
  const durationValue = `${hours}sa`;
  const durationUnit = `${mins}dk`;

  const totalEnergy = calculatedEnergy.toFixed(1);
  const totalCost = calculatedCost.toFixed(2);

  // Energy Score (EVS) Calculation
  const calculateEVS = () => {
    const T_saat = totalWorkingMinutes / 60;
    const E_gercek = calculatedEnergy;
    const Gun_filtre = filterDaysPassed;
    
    if (T_saat === 0 || E_gercek === 0) {
      return { score: 100, analysis: "Henüz kullanım verisi yok, tam verim." };
    }

    // 1. Optimum Tüketim
    const E_opt = T_saat * (NOMINAL_POWER_KW * 0.40);
    
    // 2. Tüketim Verimlilik Puanı (TVP)
    let TVP = Math.min(100, (E_opt / E_gercek) * 100);
    
    // Low consumption baseline logic
    const dailyAvg = E_gercek / activeDaysCount;
    if (dailyAvg < 2.0 && Gun_filtre <= 30) {
      TVP = Math.max(90, TVP);
    }
    
    // 3. Filtre Çarpanı
    let C_filtre = 1.0;
    if (Gun_filtre <= 15) C_filtre = 1.0;
    else if (Gun_filtre <= 30) C_filtre = 0.90;
    else C_filtre = 0.75;
    
    // 4. Nihai Skor
    const EVS = Math.round(TVP * C_filtre);
    
    let analysis = "";
    if (C_filtre === 1.0) analysis = `Filtre temiz (${Gun_filtre} gün), verimlilik yüksek.`;
    else if (C_filtre === 0.90) analysis = `Filtre temizliği geciktiği için (${Gun_filtre} gün) verim biraz düştü.`;
    else analysis = `Filtre çok kirli (${Gun_filtre} gün), ciddi enerji kaybı yaşanıyor!`;
    
    return { score: EVS, analysis };
  };

  const evsData = calculateEVS();
  const score = evsData.score;
  const scoreColor = score >= 80 ? theme.success : score >= 50 ? theme.accent : theme.danger;

  // Smart Assistant AI Message
  let assistantMessage = "Tüketim verileriniz ideal seviyede görünüyor. Enerji tasarrufu için Eco modunu değerlendirebilirsiniz.";
  
  if (Number(totalEnergy) > 100) {
    assistantMessage = `Bu ay enerji tüketiminiz oldukça yüksek (${totalEnergy} kWh). Faturanızı düşürmek için kullanım süresini azaltabilir veya dereceyi 24°C'nin üstüne alabilirsiniz.`;
  } else if (Number(totalEnergy) > 50) {
    assistantMessage = `Bu ay ortalama bir enerji tüketiminiz var (${totalEnergy} kWh). Tasarrufa devam edin!`;
  } else if (Number(totalEnergy) > 0) {
    assistantMessage = `Harika! Bu ayki enerji tüketiminiz çok düşük (${totalEnergy} kWh). Doğaya ve cebinize katkınızdan dolayı tebrikler.`;
  }

  const handleCleanFilter = async () => {
    await logFilterCleaning(tempFilterDate);
    setShowFilterModal(false);
    loadLogs();
  };

  const openFilterModal = () => {
    setTempFilterDate(new Date());
    setShowFilterModal(true);
  };

  const saveSettings = () => {
    const newMatrix: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) {
      newMatrix[i] = Number(tempMonthly[i]) || 180;
    }
    store.setTariffData(newMatrix, Number(tempDusuk), Number(tempYuksek));
    setShowSettings(false);
    loadLogs();
  };

  // Pagination for Weeks
  const weeksList: any[][] = [];
  for (let i = 0; i < dailyDataList.length; i += 7) {
    weeksList.push(dailyDataList.slice(i, i + 7));
  }
  const currentWeekData = weeksList[activeWeekIndex] || [];
  const displayData = currentWeekData.filter(d => quickFilter === 'all' ? true : d.kwh >= 5.0);
  
  let weekStartDateStr = '';
  let weekEndDateStr = '';
  let weekTotalKwh = 0;
  let weekTotalCost = 0;
  if (currentWeekData.length > 0) {
    const lastDay = currentWeekData[0]; // Newest in this chunk
    const firstDay = currentWeekData[currentWeekData.length - 1]; // Oldest in this chunk
    weekStartDateStr = new Date(firstDay.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    weekEndDateStr = new Date(lastDay.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    weekTotalKwh = currentWeekData.reduce((acc, curr) => acc + curr.kwh, 0);
    weekTotalCost = currentWeekData.reduce((acc, curr) => acc + curr.costTL, 0);
  }

  const maxKwh = Math.max(...currentWeekData.map(d => d.kwh), 8); // Minimum 8 for scale

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScrollView 
        contentContainerStyle={{ paddingHorizontal: Spacing.four, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadLogs} tintColor={theme.primary} />
        }
      >
        <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>İstatistikler</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Kademeli tarife ve kullanım analizi</Text>
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Month Selector */}
        <View style={[styles.monthSelectorV0, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }]}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtnV0}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.monthNameV0, { color: theme.text }]}>{monthName}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtnV0}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.pullHint, { color: theme.textSecondary }]}>YENİLEMEK İÇİN AŞAĞI ÇEKİN</Text>

        {/* Main Stats Grid */}
        <View style={styles.gridV0}>
          <StatCard title="Çalışma" value={durationValue} unit={durationUnit} icon="clock-outline" color={theme.primary} isStacked={true} theme={theme} />
          <StatCard title="Enerji" value={totalEnergy} unit="kWh" icon="lightning-bolt" color={theme.warn} theme={theme} />
          <StatCard title="Maliyet" value={totalCost} unit="TL" icon="wallet-outline" color={theme.success} theme={theme} />
        </View>

        {/* AI Insight Card */}
        <View style={[styles.aiCardV0, { backgroundColor: `${theme.primary}1A`, borderColor: `${theme.primary}40` }]}>
          <View style={[styles.aiIconWrapper, { backgroundColor: `${theme.primary}33` }]}>
            <MaterialCommunityIcons name="brain" size={20} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiTitleV0, { color: theme.text }]}>AI Analist</Text>
            <Text style={[styles.aiTextV0, { color: theme.textSecondary }]}>{assistantMessage}</Text>
          </View>
        </View>

        {/* Energy Score */}
        <View style={[styles.scoreCardV0, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={styles.scoreRowTop}>
            <View>
              <Text style={[styles.scoreTitleV0, { color: theme.textSecondary }]}>Enerji Verimlilik Skoru</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                <Text style={[styles.scoreValueV0, { color: scoreColor }]}>{score}</Text>
                <Text style={{ fontSize: 20, color: theme.textSecondary, fontWeight: '700' }}>/100</Text>
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: `${scoreColor}1A`, borderColor: `${scoreColor}40` }]}>
                <MaterialCommunityIcons name="leaf" size={12} color={scoreColor} style={{ marginRight: 4 }} />
                <Text style={{ color: scoreColor, fontSize: 10, fontWeight: 'bold' }}>{score >= 80 ? 'A++ Verimli' : score >= 50 ? 'Ortalama' : 'Verimsiz'}</Text>
              </View>
            </View>
            
            <View style={[styles.scoreRing, { borderColor: scoreColor, shadowColor: scoreColor }]}>
              <Text style={{ color: scoreColor, fontWeight: 'bold', fontSize: 16 }}>%{score}</Text>
            </View>
          </View>
          
          <Text style={[styles.scoreTextV0, { color: theme.textSecondary }]} numberOfLines={3}>{evsData.analysis}</Text>
          
          <TouchableOpacity onPress={openFilterModal} style={[styles.cleanFilterBtnV0, { backgroundColor: `${theme.success}1A`, borderColor: `${theme.success}40` }]}>
            <Text style={[styles.cleanFilterTextV0, { color: theme.success }]}>Filtreyi Temizledim</Text>
          </TouchableOpacity>
        </View>

        {/* Modal for Filter Date */}
        <Modal visible={showFilterModal} transparent animationType="fade">
          <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.modalHeaderV0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ backgroundColor: `${theme.success}1A`, padding: 6, borderRadius: 12 }}>
                    <MaterialCommunityIcons name="calendar-check" size={20} color={theme.success} />
                  </View>
                  <Text style={[styles.modalTitleV0, { color: theme.text }]}>Filtre Temizleme Tarihi</Text>
                </View>
                <TouchableOpacity onPress={() => setShowFilterModal(false)} style={styles.closeBtnV0}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 16, marginLeft: 40 }}>Gelecek tarih seçilemez.</Text>
              
              <View style={styles.modalDivider} />
              
              <View style={{ backgroundColor: store.isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 16, marginBottom: 16, paddingTop: 16, paddingBottom: 8, height: 220, justifyContent: 'center', overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, width: 250, alignSelf: 'center' }}>
                  <Text style={{ flex: 1, textAlign: 'center', color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Gün</Text>
                  <Text style={{ flex: 1, textAlign: 'center', color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Ay</Text>
                  <Text style={{ flex: 1, textAlign: 'center', color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Yıl</Text>
                </View>
                <DatePicker
                  value={tempFilterDate}
                  onChange={(d) => {
                    if (d && d.getTime() <= new Date().getTime()) {
                      setTempFilterDate(d);
                    }
                  }}
                  format="DD-MM-YYYY"
                  height={150}
                  textColor={theme.text}
                  markColor={store.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}
                  markHeight={40}
                  markWidth={250}
                  fadeColor={theme.backgroundElement}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setShowFilterModal(false)} style={[styles.saveBtnV0, { flex: 1, backgroundColor: store.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderWidth: 1, borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 15 }}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCleanFilter} style={[styles.saveBtnV0, { flex: 1, backgroundColor: theme.success }]}>
                  <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 15 }}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal for Settings */}
        <Modal visible={showSettings} transparent animationType="slide">
          <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, maxHeight: '85%' }]}>
              <View style={styles.modalHeaderV0}>
                <Text style={[styles.modalTitleV0, { color: theme.text }]}>Tarife & Ayarlar</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)} style={styles.closeBtnV0}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalDivider} />
              
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <MaterialCommunityIcons name="calendar-month" size={16} color={theme.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.modalLabelV0, { color: theme.textSecondary }]}>Aylık Baz Tüketim (kWh)</Text>
                </View>

                <View style={styles.monthsGridV0}>
                  {["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"].map((month, index) => (
                    <View key={index} style={styles.monthInputBoxV0}>
                      <Text style={[styles.monthInputLabelV0, { color: theme.textSecondary }]}>{month}</Text>
                      <TextInput 
                        style={[styles.inputV0, { color: theme.text }]} 
                        value={tempMonthly[index + 1]} 
                        onChangeText={(val) => setTempMonthly(prev => ({ ...prev, [index + 1]: val }))} 
                        keyboardType="numeric" 
                      />
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 12 }}>
                  <MaterialCommunityIcons name="wallet-outline" size={16} color={theme.success} style={{ marginRight: 6 }} />
                  <Text style={[styles.modalLabelV0, { color: theme.textSecondary }]}>Kademeli Tarife (TL/kWh)</Text>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, backgroundColor: store.isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 8 }}>1. Kademe</Text>
                    <TextInput style={[styles.inputV0, { borderWidth: 0, padding: 0, fontSize: 24, fontWeight: 'bold', color: theme.text }]} value={tempDusuk} onChangeText={setTempDusuk} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, backgroundColor: `${theme.primary}0D`, borderWidth: 1, borderColor: `${theme.primary}33`, borderRadius: 16, padding: 16 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 8 }}>2. Kademe</Text>
                    <TextInput style={[styles.inputV0, { borderWidth: 0, padding: 0, fontSize: 24, fontWeight: 'bold', color: theme.primary }]} value={tempYuksek} onChangeText={setTempYuksek} keyboardType="numeric" />
                  </View>
                </View>
              </ScrollView>

              <TouchableOpacity onPress={saveSettings} style={[styles.saveBtnV0, { backgroundColor: theme.primary }]}>
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 15 }}>Buluta Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Advanced Analyst Stats */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Analiz ve Alışkanlıklar</Text>
        </View>

        <View style={[styles.analysisCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.analysisTitle, { color: theme.text }]}>Kullanım Alışkanlığı Haritası</Text>
          <Text style={[styles.analysisDesc, { color: theme.textSecondary }]}>
            En yoğun kullanım: <Text style={{ fontWeight: '700', color: theme.primary }}>18:00 - 22:00</Text>
          </Text>
          <View style={styles.timeBarContainer}>
            <View style={[styles.timeBarSegment, { flex: 1, backgroundColor: `${theme.primary}20`, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
            <View style={[styles.timeBarSegment, { flex: 2, backgroundColor: `${theme.primary}50` }]} />
            <View style={[styles.timeBarSegment, { flex: 3, backgroundColor: theme.primary }]} />
            <View style={[styles.timeBarSegment, { flex: 1.5, backgroundColor: `${theme.primary}50`, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
          </View>
          <View style={styles.timeLabels}>
            <Text style={styles.timeLabelText}>06:00</Text>
            <Text style={styles.timeLabelText}>12:00</Text>
            <Text style={styles.timeLabelText}>18:00</Text>
            <Text style={styles.timeLabelText}>24:00</Text>
          </View>
        </View>

        <View style={[styles.analysisCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.analysisTitle, { color: theme.text }]}>Sıcaklık Tercih Dağılımı</Text>
          <Text style={[styles.analysisDesc, { color: theme.textSecondary }]}>
            %70 oranında 24°C, %30 oranında 25°C kullanıyorsunuz.
          </Text>
          <View style={styles.tempBarContainer}>
            <View style={[styles.tempBarFill, { width: '70%', backgroundColor: theme.primary, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
            <View style={[styles.tempBarFill, { width: '30%', backgroundColor: theme.accent, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
          </View>
          <View style={styles.tempLabels}>
            <View style={styles.tempLabelRow}>
              <View style={[styles.dot, { backgroundColor: theme.primary }]} />
              <Text style={[styles.tempLabelText, { color: theme.textSecondary }]}>24°C (%70)</Text>
            </View>
            <View style={styles.tempLabelRow}>
              <View style={[styles.dot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.tempLabelText, { color: theme.textSecondary }]}>25°C (%30)</Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* GÜNLÜK TÜKETİM TAKİP & DETAY BİLEŞENİ (DAILY METRICS) */}
        {/* ========================================================================= */}
        <View style={[styles.dailyPanelContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          
          <View style={styles.dailyPanelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 11, color: theme.textSecondary }}>Günlük Analiz</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 4 }}>
                  Günlük Tüketim & Detay Takibi
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCalendarModal(true)} style={[styles.calendarBtn, { backgroundColor: `${theme.primary}1A`, borderColor: `${theme.primary}4D`, padding: 8, borderRadius: 12 }]}>
                <MaterialCommunityIcons name="calendar-month" size={20} color={theme.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Week Navigation */}
          {weeksList.length > 0 && (
            <View style={[styles.weekNavContainer, { backgroundColor: store.isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderColor: theme.border, flexDirection: 'column', paddingVertical: 12, alignItems: 'center' }]}>
              
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: 'bold' }}>{weekStartDateStr} - {weekEndDateStr}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>{activeWeekIndex + 1}. Hafta</Text>
                  <Text style={{ color: theme.warn, fontSize: 12, fontWeight: 'bold' }}>{weekTotalKwh.toFixed(1)} kWh</Text>
                  <Text style={{ color: theme.success, fontSize: 12, fontWeight: 'bold' }}>{weekTotalCost.toFixed(2)} TL</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', paddingHorizontal: 20 }}>
                <TouchableOpacity 
                  style={[{ flexDirection: 'row', alignItems: 'center' }, activeWeekIndex >= weeksList.length - 1 && { opacity: 0.3 }]}
                  disabled={activeWeekIndex >= weeksList.length - 1}
                  onPress={() => setActiveWeekIndex(prev => prev + 1)}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Önceki Hafta</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[{ flexDirection: 'row', alignItems: 'center' }, activeWeekIndex <= 0 && { opacity: 0.3 }]}
                  disabled={activeWeekIndex <= 0}
                  onPress={() => setActiveWeekIndex(prev => prev - 1)}
                >
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold', marginRight: 4 }}>Sonraki Hafta</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Toggle Buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity 
              style={[styles.toggleBtn, viewMode === 'chart' ? { backgroundColor: theme.primary } : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => setViewMode('chart')}
            >
              <MaterialCommunityIcons name="chart-bar" size={16} color={viewMode === 'chart' ? '#000' : theme.textSecondary} />
              <Text style={{ color: viewMode === 'chart' ? '#000' : theme.textSecondary, fontWeight: 'bold', marginLeft: 4 }}>Grafik</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toggleBtn, viewMode === 'cards' ? { backgroundColor: theme.primary } : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => setViewMode('cards')}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={viewMode === 'cards' ? '#000' : theme.textSecondary} />
              <Text style={{ color: viewMode === 'cards' ? '#000' : theme.textSecondary, fontWeight: 'bold', marginLeft: 4 }}>Liste</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toggleBtn, quickFilter === 'high_kwh' ? { backgroundColor: `${theme.warn}33`, borderColor: theme.warn, borderWidth: 1 } : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => setQuickFilter(prev => prev === 'all' ? 'high_kwh' : 'all')}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={16} color={quickFilter === 'high_kwh' ? theme.warn : theme.textSecondary} />
              <Text style={{ color: quickFilter === 'high_kwh' ? theme.warn : theme.textSecondary, fontWeight: 'bold', marginLeft: 4 }}>Yüksek Harcama</Text>
            </TouchableOpacity>
          </View>

          {/* Chart View */}
          {viewMode === 'chart' && weeksList.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 12, textAlign: 'center' }}>Günlük kWh Tüketimi</Text>
              <View style={{ alignItems: 'center', backgroundColor: store.isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.border }}>
                <BarChart
                  data={currentWeekData.slice().reverse().map(day => ({
                    value: day.kwh,
                    label: day.dayName.substring(0,3),
                    frontColor: theme.primary,
                    topColor: theme.primary,
                    onPress: () => {
                      setSelectedDailyData(day);
                      setShowDailyModal(true);
                    }
                  }))}
                  width={250}
                  height={150}
                  barWidth={22}
                  spacing={16}
                  roundedTop
                  hideRules
                  xAxisThickness={1}
                  yAxisThickness={1}
                  yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                  yAxisColor={theme.border}
                  xAxisColor={theme.border}
                  maxValue={maxKwh}
                  noOfSections={4}
                  isAnimated
                />
              </View>
            </View>
          )}

          {/* List/Cards View */}
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary }}>
                Günlük Kayıtlar ({displayData.length} Gün)
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary }}>Tümü incelenebilir</Text>
            </View>

            {displayData.map((day, idx) => (
              <TouchableOpacity 
                key={day.id || idx} 
                style={[styles.dailyCard, { backgroundColor: store.isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: store.isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}
                onPress={() => {
                  setSelectedDailyData(day);
                  setShowDailyModal(true);
                }}
              >
                
                {/* Top Row: Date & Day name + Efficiency Badge */}
                <View style={styles.dailyCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.text }}>{day.dateDisplay}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>({day.dayName})</Text>
                  </View>
                  <View style={[styles.effBadge, { backgroundColor: `${theme.success}1A`, borderColor: `${theme.success}4D` }]}>
                    <Text style={{ color: theme.success, fontSize: 10, fontWeight: 'bold' }}>{day.efficiencyScore}/100 Verim</Text>
                  </View>
                </View>

                {/* Metrics Row: Hours, kWh, TL */}
                <View style={[styles.metricsRow, { backgroundColor: store.isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', borderColor: store.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Çalışma</Text>
                    <Text style={[styles.metricValue, { color: theme.text }]}>{day.workingHoursFormatted}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Tüketim</Text>
                    <Text style={[styles.metricValue, { color: theme.warn }]}>{day.kwh} kWh</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Maliyet</Text>
                    <Text style={[styles.metricValue, { color: theme.success }]}>{day.costTL} TL</Text>
                  </View>
                </View>

                {/* Bottom Row: AI Insight Snippet */}
                <View style={styles.insightRow}>
                  <Text style={styles.insightText} numberOfLines={1}>
                    "{day.aiInsight}"
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold', marginRight: 4 }}>Detay</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color={theme.primary} />
                  </View>
                </View>
                
              </TouchableOpacity>
            ))}
            
            {displayData.length === 0 && (
              <Text style={{ textAlign: 'center', color: theme.textSecondary, marginTop: 20, fontSize: 14 }}>
                Seçili haftada veya filtrede kullanım verisi bulunamadı.
              </Text>
            )}

          </View>
        </View>

      </ScrollView>

      {/* Rapor ve Takvim Modalları */}
      <DailyDetailModal 
        isOpen={showDailyModal} 
        onClose={() => setShowDailyModal(false)} 
        data={selectedDailyData} 
      />

      <CalendarFilterModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        selectedDate={calendarSelectedDate}
        onSelectDate={(dateStr) => {
          setCalendarSelectedDate(dateStr);
          // Go to that week if found
          const dayIndex = dailyDataList.findIndex(d => d.date === dateStr);
          if (dayIndex !== -1) {
            const weekIdx = Math.floor(dayIndex / 7);
            setActiveWeekIndex(weekIdx);
          }
        }}
        dailyDataList={dailyDataList}
      />
    </View>
  );
}

function StatCard({ title, value, unit, icon, color, isStacked, theme }: any) {
  return (
    <View style={[styles.statCardV0, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.statIconWrapperV0, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statTitleV0, { color: theme.textSecondary }]}>{title}</Text>
      <View style={{ flexDirection: isStacked ? 'column' : 'row', alignItems: isStacked ? 'flex-start' : 'baseline', marginTop: 4 }}>
        <Text style={[styles.statValueV0, { color: theme.text }]}>{value}</Text>
        {unit && <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: isStacked ? 0 : 2, marginTop: isStacked ? 2 : 0, fontWeight: '500' }}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingVertical: Spacing.four },
  title: { fontSize: 28, fontWeight: '700', marginBottom: Spacing.one },
  subtitle: { fontSize: 16, fontWeight: '500' },
  aiCard: { padding: Spacing.four, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.four },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiTitle: { fontSize: 16, fontWeight: '700' },
  aiText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginBottom: Spacing.four },
  statCard: { width: '47%', padding: Spacing.four, borderRadius: Radius.lg, borderWidth: 1, ...Shadows.card },
  statValue: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  statTitle: { fontSize: 13, fontWeight: '500' },
  monthSelectorV0: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 4, borderRadius: Radius.full, borderWidth: 1, marginBottom: 8 },
  monthNameV0: { fontSize: 16, fontWeight: '600' },
  navBtnV0: { padding: 8, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.05)' },
  pullHint: { fontSize: 10, textAlign: 'center', marginBottom: Spacing.six, fontWeight: '600', letterSpacing: 1 },
  gridV0: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, marginBottom: Spacing.six },
  statCardV0: { flex: 1, padding: 12, borderRadius: Radius.xl, borderWidth: 1 },
  statIconWrapperV0: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statValueV0: { fontSize: 18, fontWeight: '700', fontFamily: 'mono' },
  statTitleV0: { fontSize: 11, fontWeight: '600' },
  aiCardV0: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: Radius.xl, borderWidth: 1, gap: 16, marginBottom: Spacing.six },
  aiIconWrapper: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  aiTitleV0: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  aiTextV0: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  scoreCardV0: { padding: 16, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.six },
  scoreRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  scoreTitleV0: { fontSize: 13, fontWeight: '600' },
  scoreValueV0: { fontSize: 40, fontWeight: '700', fontFamily: 'mono' },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start', marginTop: 4 },
  scoreRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  scoreTextV0: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  cleanFilterBtnV0: { padding: 12, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center' },
  cleanFilterTextV0: { fontSize: 13, fontWeight: '600' },
  sectionHeader: { marginTop: Spacing.two, marginBottom: Spacing.four },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  analysisCard: { padding: Spacing.four, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.four, backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' },
  analysisTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  analysisDesc: { fontSize: 14, marginBottom: Spacing.four },
  timeBarContainer: { flexDirection: 'row', height: 24, borderRadius: Radius.md, backgroundColor: '#E5E5E530', marginBottom: 8 },
  timeBarSegment: { height: '100%' },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  timeLabelText: { fontSize: 12, color: '#888', fontWeight: '500' },
  tempBarContainer: { flexDirection: 'row', height: 16, borderRadius: Radius.md, backgroundColor: '#E5E5E530', marginBottom: 12 },
  tempBarFill: { height: '100%' },
  tempLabels: { flexDirection: 'row', gap: Spacing.four },
  tempLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tempLabelText: { fontSize: 13, fontWeight: '500' },
  settingsBtn: { padding: 8 },
  cleanFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderRadius: 8, marginTop: 12, justifyContent: 'center' },
  cleanFilterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', padding: 20, borderRadius: 24 },
  modalHeaderV0: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitleV0: { fontSize: 20, fontWeight: 'bold' },
  closeBtnV0: { padding: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)' },
  modalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: -20, marginBottom: 20 },
  modalLabelV0: { fontSize: 14, fontWeight: '600' },
  monthsGridV0: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
  monthInputBoxV0: { width: '31%', marginBottom: 12 },
  monthInputLabelV0: { fontSize: 11, marginBottom: 4, fontWeight: '600', textAlign: 'center' },
  inputV0: { borderWidth: 1, borderColor: 'rgba(150,150,150,0.2)', backgroundColor: 'transparent', borderRadius: 12, padding: 10, fontSize: 15, textAlign: 'center' },
  saveBtnV0: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  modalLabel: { fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderColor: '#ccc' },
  cancelBtn: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  saveBtn: { padding: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  
  dailyPanelContainer: { padding: 16, borderRadius: Radius.xl, borderWidth: 1, marginTop: 8 },
  dailyPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: 'rgba(150,150,150,0.1)', paddingBottom: 12 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, borderWidth: 1 },
  
  weekNavContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderRadius: Radius.lg, marginVertical: 16 },
  weekNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 8 },
  
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.md },
  
  chartContainer: { height: 180, flexDirection: 'row', padding: 8, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  chartYAxis: { justifyContent: 'space-between', paddingRight: 8, borderRightWidth: 1, borderRightColor: 'rgba(150,150,150,0.2)', width: 30, alignItems: 'center' },
  chartYLabel: { fontSize: 10, fontWeight: '600' },
  chartBars: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingTop: 10, paddingBottom: 0 },
  barCol: { alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: 30 },
  barTrack: { flex: 1, width: 24, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  barFill: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 9, marginTop: 4, fontWeight: '600' },

  dailyCard: { padding: 14, borderRadius: Radius.lg, borderWidth: 1, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  dailyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  effBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: Radius.md, borderWidth: 1, marginBottom: 8 },
  metricItem: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: '#888', marginBottom: 2 },
  metricValue: { fontSize: 12, fontWeight: 'bold' },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 },
  insightText: { fontSize: 10, color: '#888', fontStyle: 'italic', flex: 1, marginRight: 8 },
});
