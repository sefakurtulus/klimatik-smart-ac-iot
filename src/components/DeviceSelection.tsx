import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, Animated, Dimensions, Share } from 'react-native';
import { useAcStore } from '@/store/useAcStore';
import { Colors, Radius } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { registerNewDeviceToFirebase, deleteDeviceFromFirebase, sendNewWifiCredentials, subscribeToLastSeenRTDB } from '@/services/firebaseService';
import { bleService } from '@/services/bleService';
import type { Device } from 'react-native-ble-plx';

type WizardStep = 'scanning' | 'deviceFound' | 'wifiSelect' | 'password' | 'naming' | 'saving' | 'verifying' | 'joinDevice';

export default function DeviceSelectionScreen() {
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];
  
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState<WizardStep>('scanning');
  
  const [selectedWifi, setSelectedWifi] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  
  // Join Existing Device
  const [joinDeviceId, setJoinDeviceId] = useState('');

  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSsid, setEditSsid] = useState('');
  const [editPass, setEditPass] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [bleError, setBleError] = useState('');
  const [foundDevice, setFoundDevice] = useState<Device | null>(null);

  // Mock WiFi list (Ideally should scan WiFi, but for now we mock or let user type)
  const mockNetworks = ['Ev_WiFi_5G', 'TurkTelekom_TP943', 'Misafir', 'Superonline_WiFi'];

  const startWizard = async () => {
    setBleError('');
    setStep('scanning');
    setShowWizard(true);
    
    const hasPermission = await bleService.requestPermissions();
    if (!hasPermission) {
      setBleError('Bluetooth ve Konum izni reddedildi.');
      return;
    }

    bleService.scanForESP32(
      (device) => {
        setFoundDevice(device);
        setStep('deviceFound');
      },
      (error) => {
        setBleError(error);
      }
    );
  };

  const startJoinWizard = () => {
    setJoinDeviceId('');
    setDeviceName('');
    setStep('joinDevice');
    setShowWizard(true);
  };

  const finishProvisioning = async () => {
    if (!foundDevice) return;
    
    setStep('saving');
    const newDeviceId = 'dev_' + Math.random().toString(36).substring(2, 9);
    
    // Send to ESP32
    const success = await bleService.sendWifiCredentials(
      foundDevice,
      selectedWifi,
      password,
      newDeviceId
    );

    if (success) {
      setStep('verifying');
      
      let isVerified = false;
      let unsubscribe: any = null;

      const verificationPromise = new Promise<boolean>((resolve) => {
        // Dinleyici başlat
        unsubscribe = subscribeToLastSeenRTDB(newDeviceId, (timestamp) => {
          // Eğer 45 saniye içinde güncellenmiş taze bir lastSeen gelirse cihaz bağlandı demektir.
          if (timestamp && Date.now() - timestamp < 45000) {
            resolve(true);
          }
        });

        // Maksimum 20 saniye bekle, bağlanmazsa false dön
        setTimeout(() => {
          resolve(false);
        }, 20000);
      });

      isVerified = await verificationPromise;
      if (unsubscribe) unsubscribe();

      if (isVerified) {
        const newDevice = {
          id: newDeviceId,
          name: deviceName || 'Yeni Klima',
          ssid: selectedWifi
        };

        await registerNewDeviceToFirebase('default_user_123', newDevice);
        store.addDevice(newDevice);
        
        setStep('saving');
        setTimeout(() => {
          setShowWizard(false);
          store.setActiveDeviceId(newDeviceId);
        }, 1000);
      } else {
        setBleError('Cihaz internete çıkamadı. Şifre yanlış olabilir.');
        setStep('scanning');
      }
    } else {
      setBleError('Cihaza bağlantı bilgileri gönderilemedi.');
      setStep('scanning');
    }
  };

  const finishJoinDevice = async () => {
    if (joinDeviceId.length === 0 || deviceName.length === 0) return;
    
    setStep('saving');
    
    // Doğrudan Firebase ve Local Store'a kaydet (BLE olmadan)
    const newDevice = {
      id: joinDeviceId,
      name: deviceName,
      ssid: 'Paylaşılan Cihaz'
    };

    await registerNewDeviceToFirebase('default_user_123', newDevice);
    store.addDevice(newDevice);
    
    setTimeout(() => {
      setShowWizard(false);
      store.setActiveDeviceId(joinDeviceId);
    }, 1000);
  };

  const renderWizardContent = () => {
    switch (step) {
      case 'scanning':
        return (
          <View style={styles.wizardCenter}>
            {bleError ? (
              <>
                <MaterialCommunityIcons name="alert-circle" size={64} color={theme.error} />
                <Text style={[styles.wizardTitle, { color: theme.error, marginTop: 20 }]}>Hata Oluştu</Text>
                <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 20 }]}>{bleError}</Text>
                <TouchableOpacity 
                  style={[styles.wizardButton, { backgroundColor: theme.primary, marginTop: 30 }]}
                  onPress={startWizard}
                >
                  <Text style={styles.wizardButtonText}>Tekrar Dene</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.wizardTitle, { color: theme.text, marginTop: 20 }]}>KUK Cihazı Aranıyor...</Text>
                <Text style={[styles.wizardSubtitle, { color: theme.textSecondary }]}>Lütfen Klimatik cihazınızın gücünü açın.</Text>
                
                <TouchableOpacity 
                  style={[styles.wizardButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border, marginTop: 30 }]}
                  onPress={() => setShowWizard(false)}
                >
                  <Text style={[styles.wizardButtonText, { color: theme.text }]}>İptal Et</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );
      case 'deviceFound':
        return (
          <View style={styles.wizardCenter}>
            <MaterialCommunityIcons name="air-conditioner" size={64} color={theme.success} />
            <Text style={[styles.wizardTitle, { color: theme.text, marginTop: 20 }]}>Cihaz Bulundu!</Text>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary }]}>Klimatik-ESP32 kurulum için hazır.</Text>
            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: theme.primary, marginTop: 30 }]}
              onPress={() => setStep('wifiSelect')}
            >
              <Text style={styles.wizardButtonText}>Kuruluma Başla</Text>
            </TouchableOpacity>
          </View>
        );
      case 'wifiSelect':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[styles.wizardTitle, { color: theme.text, marginBottom: 20 }]}>Wi-Fi Ağınızı Girin</Text>
            
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Ağ Adı (SSID)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border, marginBottom: 15 }]}
              placeholder="Büyük/küçük harfe dikkat edin"
              placeholderTextColor={theme.textSecondary}
              value={selectedWifi}
              onChangeText={setSelectedWifi}
            />
            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: theme.primary, marginBottom: 20, opacity: selectedWifi.length > 0 ? 1 : 0.5 }]}
              disabled={selectedWifi.length === 0}
              onPress={() => setStep('password')}
            >
              <Text style={styles.wizardButtonText}>İleri</Text>
            </TouchableOpacity>

            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 10, textAlign: 'center' }]}>--- Veya Örnek Listeden Seç ---</Text>
            <ScrollView>
              {mockNetworks.map(net => (
                <TouchableOpacity 
                  key={net}
                  style={[styles.wifiItem, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                  onPress={() => {
                    setSelectedWifi(net);
                    setStep('password');
                  }}
                >
                  <MaterialCommunityIcons name="wifi" size={24} color={theme.text} />
                  <Text style={[styles.wifiText, { color: theme.text }]}>{net}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      case 'password':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <TouchableOpacity onPress={() => setStep('wifiSelect')} style={{ marginRight: 15 }}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.wizardTitle, { color: theme.text }]}>Şifre Girin</Text>
            </View>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 20 }]}>Ağ: {selectedWifi}</Text>
            
            <View style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', paddingRight: 10 }]}>
              <TextInput
                style={{ flex: 1, color: theme.text, height: '100%' }}
                placeholder="Wi-Fi Şifresi"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 5 }}>
                <MaterialCommunityIcons name={showPassword ? "eye-off" : "eye"} size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: theme.primary, marginTop: 20, opacity: password.length > 0 ? 1 : 0.5 }]}
              disabled={password.length === 0}
              onPress={() => setStep('naming')}
            >
              <Text style={styles.wizardButtonText}>Bağlan</Text>
            </TouchableOpacity>
          </View>
        );
      case 'naming':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[styles.wizardTitle, { color: theme.text, marginBottom: 10 }]}>Cihaza İsim Verin</Text>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 20 }]}>Bu klima nerede bulunuyor?</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
              placeholder="Örn: Salon, Yatak Odası"
              placeholderTextColor={theme.textSecondary}
              value={deviceName}
              onChangeText={setDeviceName}
            />
            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: theme.primary, marginTop: 20, opacity: deviceName.length > 0 ? 1 : 0.5 }]}
              disabled={deviceName.length === 0}
              onPress={finishProvisioning}
            >
              <Text style={styles.wizardButtonText}>Kaydet ve Bitir</Text>
            </TouchableOpacity>
          </View>
        );
      case 'verifying':
        return (
          <View style={styles.wizardCenter}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.wizardTitle, { color: theme.text, marginTop: 20 }]}>Ağ Doğrulanıyor...</Text>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, textAlign: 'center' }]}>Cihazın internete bağlanması bekleniyor. (Maks. 20s)</Text>
          </View>
        );
      case 'saving':
        return (
          <View style={styles.wizardCenter}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.wizardTitle, { color: theme.text, marginTop: 20 }]}>Kurulum Tamamlanıyor...</Text>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary }]}>Cihaz kaydediliyor.</Text>
          </View>
        );
      case 'joinDevice':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.wizardTitle, { color: theme.text }]}>Mevcut Cihaza Katıl</Text>
            </View>
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 20 }]}>Ailenizin paylaştığı cihaz kodunu girin.</Text>
            
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Cihaz Kodu</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border, marginBottom: 15 }]}
              placeholder="Örn: dev_xyz123"
              placeholderTextColor={theme.textSecondary}
              value={joinDeviceId}
              onChangeText={setJoinDeviceId}
              autoCapitalize="none"
            />

            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Cihaza İsim Verin</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border, marginBottom: 15 }]}
              placeholder="Örn: Ev Kliması"
              placeholderTextColor={theme.textSecondary}
              value={deviceName}
              onChangeText={setDeviceName}
            />

            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: theme.primary, marginTop: 20, opacity: (joinDeviceId.length > 0 && deviceName.length > 0) ? 1 : 0.5 }]}
              disabled={joinDeviceId.length === 0 || deviceName.length === 0}
              onPress={finishJoinDevice}
            >
              <Text style={styles.wizardButtonText}>Kaydet ve Bağlan</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Cihazlarınız</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>Yönetmek istediğiniz klimayı seçin.</Text>
      </View>

      {store.devices.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="air-conditioner" size={80} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>Henüz Cihaz Yok</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>Yeni bir cihaz ekleyerek otomasyon dünyasına adım atın.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer}>
          {store.devices.map(device => (
            <View key={device.id} style={[styles.deviceCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <TouchableOpacity 
                style={styles.deviceInfoContainer}
                onPress={() => store.setActiveDeviceId(device.id)}
              >
                <View style={styles.deviceIcon}>
                  <MaterialCommunityIcons name="air-conditioner" size={32} color={theme.primary} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: theme.text }]}>{device.name}</Text>
                  <Text style={[styles.deviceId, { color: theme.textSecondary }]}>Ağ: {device.ssid || 'Bağlı Değil'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => {
                  setEditingDevice(device.id);
                  setEditName(device.name);
                  setEditSsid(device.ssid || '');
                  setEditPass('');
                }}
              >
                <MaterialCommunityIcons name="cog" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.primary, marginBottom: 10 }]} onPress={startWizard}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
          <Text style={styles.addButtonText}>Yeni Cihaz Kur (BLE)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: store.isDarkMode ? '#1e293b' : '#e2e8f0' }]} onPress={startJoinWizard}>
          <MaterialCommunityIcons name="link-variant" size={24} color={theme.text} />
          <Text style={[styles.addButtonText, { color: theme.text }]}>Mevcut Cihaza Katıl (Kod)</Text>
        </TouchableOpacity>
      </View>

      {/* Wizard Modal */}
      <Modal visible={showWizard} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            {step !== 'saving' && step !== 'scanning' && step !== 'deviceFound' && (
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowWizard(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            )}
            {renderWizardContent()}
          </View>
        </View>
      </Modal>

      {/* Edit Device Modal */}
      <Modal visible={editingDevice !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalContent, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.wizardTitle, { color: theme.text, marginBottom: 20 }]}>Cihazı Düzenle</Text>
            
            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Cihaz İsmi</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, marginBottom: 15 }]}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Cihaz Paylaşım Kodu</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <View style={[styles.input, { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)', borderColor: theme.border, justifyContent: 'center', opacity: 0.7 }]}>
                <Text style={{ color: theme.text }} selectable={true}>{editingDevice}</Text>
              </View>
              <TouchableOpacity 
                style={{ backgroundColor: theme.primary, height: 60, width: 60, borderRadius: Radius.md, marginLeft: 10, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => {
                  if (editingDevice) {
                    Share.share({
                      message: `Klimatik ESP32 Cihaz Kodu:\n\n${editingDevice}\n\nBu kodu "Mevcut Cihaza Katıl" bölümünden girerek klimaya erişebilirsin.`
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="share-variant" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Bağlı Wi-Fi Ağı</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, marginBottom: 15 }]}
              value={editSsid}
              onChangeText={setEditSsid}
              placeholder="Örn: Ev_WiFi"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.wizardSubtitle, { color: theme.textSecondary, marginBottom: 5, textAlign: 'left' }]}>Yeni Wi-Fi Şifresi</Text>
            <View style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', paddingRight: 10 }]}>
              <TextInput
                style={{ flex: 1, color: theme.text, height: '100%' }}
                value={editPass}
                onChangeText={setEditPass}
                placeholder="Gerekmiyorsa boş bırakın"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showEditPassword}
              />
              <TouchableOpacity onPress={() => setShowEditPassword(!showEditPassword)} style={{ padding: 5 }}>
                <MaterialCommunityIcons name={showEditPassword ? "eye-off" : "eye"} size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
              <TouchableOpacity 
                style={[styles.wizardButton, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setEditingDevice(null)}
              >
                <Text style={[styles.wizardButtonText, { color: theme.text }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.wizardButton, { flex: 1, backgroundColor: theme.primary }]}
                onPress={async () => {
                  if (editingDevice) {
                    store.updateDevice(editingDevice, { name: editName, ssid: editSsid });
                    
                    if (editPass && editPass.trim() !== '') {
                      await sendNewWifiCredentials(editingDevice, editSsid, editPass);
                    }
                    
                    setEditingDevice(null);
                  }
                }}
              >
                <Text style={styles.wizardButtonText}>Kaydet</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.wizardButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.error, marginTop: 15 }]}
              onPress={async () => {
                if (editingDevice) {
                  // Cihazı sil
                  await deleteDeviceFromFirebase('default_user_123', editingDevice);
                  store.removeDevice(editingDevice);
                  setEditingDevice(null);
                }
              }}
            >
              <Text style={[styles.wizardButtonText, { color: theme.error }]}>Cihazı Sil (Sıfırla)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 15,
  },
  deviceInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 10,
    marginLeft: 10,
  },
  deviceIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
  addButton: {
    flexDirection: 'row',
    height: 60,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '80%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
  },
  editModalContent: {
    margin: 20,
    borderRadius: 20,
    padding: 20,
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  wizardCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wizardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  wizardSubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  wizardButton: {
    width: '100%',
    height: 56,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wizardButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  wifiItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  wifiText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 15,
  },
  input: {
    height: 60,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 20,
    fontSize: 16,
  }
});
