import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, TextInput, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadows, Spacing } from '@/constants/theme';
import { useAcStore } from '@/store/useAcStore';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];

  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [ipInput, setIpInput] = useState(store.ipAddress);

  const [billModalVisible, setBillModalVisible] = useState(false);
  const [billAmountInput, setBillAmountInput] = useState(store.lastBillAmount.toString());
  const [billConsumptionInput, setBillConsumptionInput] = useState(store.lastBillConsumption.toString());
  const [billDaysInput, setBillDaysInput] = useState(store.lastBillDays.toString());

  const [otaModalVisible, setOtaModalVisible] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const SETTINGS = [
    { 
      title: 'Cihaz Paylaşım Kodu', icon: 'share-variant', type: 'link', 
      value: store.activeDeviceId ? store.activeDeviceId : 'Cihaz Yok',
      onPress: () => {
        if (store.activeDeviceId) {
          // React Native'de Clipboard normalde eklenti gerektirir ama Alert ile kodu kolayca seçilebilir yapıyoruz
          showAlert('Cihaz Kodu', `Bu kodu başka bir telefona girerek cihaza ortak olabilirsiniz:\n\n${store.activeDeviceId}`);
        } else {
          showAlert('Uyarı', 'Aktif bir cihaz bulunmuyor.');
        }
      } 
    },
    { 
      title: 'ESP32 Bağlantısı', icon: 'wifi-cog', type: 'link', 
      onPress: () => { setIpInput(store.ipAddress); setIpModalVisible(true); } 
    },
    { 
      title: 'ESP32 İletişimi', icon: 'transit-connection-variant', type: 'toggle', 
      state: store.isEspEnabled, 
      onToggle: store.toggleEspEnabled 
    },
    { 
      title: 'Fatura ve Tarife Ayarları', icon: 'currency-try', type: 'link', 
      onPress: () => { 
        setBillAmountInput(store.lastBillAmount.toString());
        setBillConsumptionInput(store.lastBillConsumption.toString());
        setBillDaysInput(store.lastBillDays.toString());
        setBillModalVisible(true); 
      } 
    },
    { 
      title: 'IR LED Kalibrasyonu', icon: 'remote', type: 'link', 
      onPress: () => showAlert('Bilgi', 'Bu özellik yakında eklenecektir.') 
    },
    { 
      title: 'Sensör Hassasiyeti', icon: 'thermometer-lines', type: 'link', 
      onPress: () => showAlert('Bilgi', 'Bu özellik yakında eklenecektir.') 
    },
    { title: 'Bildirimler', icon: 'bell-outline', type: 'toggle', state: store.notificationsEnabled, onToggle: store.toggleNotifications },
    { title: 'Koyu Tema', icon: 'moon-waning-crescent', type: 'toggle', state: store.isDarkMode, onToggle: store.toggleDarkMode },
    { 
      title: 'Geliştirici Modu', icon: 'code-tags', type: 'toggle', state: store.devMode, 
      onToggle: () => {
        const nextState = !store.devMode;
        store.toggleDevMode();
        if (nextState) {
          showAlert('Geliştirici Modu', 'Geliştirici seçenekleri aktif. Yerel API portu dinleniyor...');
        } else {
          showAlert('Geliştirici Modu', 'Geliştirici seçenekleri kapatıldı.');
        }
      } 
    },
    { title: 'Donanım Güncellemesi', icon: 'update', type: 'link', value: 'v1.0.4', onPress: () => setOtaModalVisible(true) },
  ];

  const handleSaveIp = () => {
    store.setIpAddress(ipInput);
    setIpModalVisible(false);
  };

  const handleSaveBill = () => {
    const amt = parseFloat(billAmountInput);
    const cons = parseFloat(billConsumptionInput);
    const days = parseInt(billDaysInput, 10);
    if (!isNaN(amt) && !isNaN(cons) && !isNaN(days)) {
      store.setBillData(amt, cons, days);
    }
    setBillModalVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.four, paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Ayarlar</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Sistem ve cihaz konfigürasyonu</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {SETTINGS.map((item, index) => (
            <TouchableOpacity 
              key={index} 
              style={[
                styles.row, 
                index !== SETTINGS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }
              ]}
              disabled={item.type === 'toggle'}
              onPress={item.onPress}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconBox, { backgroundColor: `${theme.primary}15` }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={22} color={theme.primary} />
                </View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
              </View>
              <View style={styles.rowRight}>
                {item.value && <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{item.value}</Text>}
                {item.type === 'link' && <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />}
                {item.type === 'toggle' && (
                  <Switch 
                    value={item.state}
                    onValueChange={item.onToggle}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor="#FFF"
                  />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.dangerButton, { backgroundColor: `${theme.danger}15` }]}>
          <MaterialCommunityIcons name="restart" size={20} color={theme.danger} />
          <Text style={[styles.dangerText, { color: theme.danger }]}>ESP32'yi Yeniden Başlat</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* IP Modal */}
      <Modal visible={ipModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>ESP32 IP Adresi</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={ipInput}
              onChangeText={setIpInput}
              placeholder="192.168.x.x"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setIpModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={handleSaveIp}>
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bill Settings Modal */}
      <Modal visible={billModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Fatura ve Tarife</Text>
            <Text style={[styles.modalDesc, { color: theme.textSecondary }]}>
              Akıllı hesaplama motoru için son faturanızı girin.{'\n'}
              <Text style={{ fontWeight: '600' }}>1. Kademe (Günlük 8 kWh'e kadar): {store.getBaseUnitPrice().toFixed(2)} TL/kWh</Text>{'\n'}
              <Text style={{ fontWeight: '600' }}>2. Kademe (Aşan kısım): {(store.getBaseUnitPrice() * 1.5).toFixed(2)} TL/kWh</Text>
            </Text>
            
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Son Fatura Tutarı (TL)</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginBottom: Spacing.two }]}
              value={billAmountInput}
              onChangeText={setBillAmountInput}
              placeholder="Örn: 450"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Son Tüketim (kWh)</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginBottom: Spacing.two }]}
              value={billConsumptionInput}
              onChangeText={setBillConsumptionInput}
              placeholder="Örn: 220"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fatura Gün Sayısı</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={billDaysInput}
              onChangeText={setBillDaysInput}
              placeholder="Örn: 30"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setBillModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={handleSaveBill}>
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Hesapla ve Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* OTA Modal */}
      <Modal visible={otaModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border, alignItems: 'center' }]}>
            <MaterialCommunityIcons name="cloud-download-outline" size={48} color={theme.primary} style={{ marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: 'center' }]}>Donanım Güncellemesi</Text>
            <Text style={[styles.modalDesc, { color: theme.textSecondary, textAlign: 'center', marginBottom: 24 }]}>
              Mevcut Versiyon: v1.0.4{'\n'}Cihazınız için yeni bir donanım yazılımı olup olmadığını kontrol edin.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setOtaModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={() => Alert.alert('Güncel', 'Donanımınız güncel.')}>
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Denetle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingVertical: Spacing.four, marginBottom: Spacing.two },
  title: { fontSize: 28, fontWeight: '700', marginBottom: Spacing.one },
  subtitle: { fontSize: 16, fontWeight: '500' },
  section: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.six, ...Shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: 14 },
  dangerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.four, borderRadius: Radius.lg },
  dangerText: { fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.four },
  modalContent: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.four, ...Shadows.floating },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: Spacing.two },
  modalDesc: { fontSize: 14, marginBottom: Spacing.four, lineHeight: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginLeft: 2 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, fontSize: 16, marginBottom: Spacing.four },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  modalBtn: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: Radius.md },
  modalBtnText: { fontSize: 15, fontWeight: '600' }
});
