import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp, increment, query, where, getDocs, orderBy, deleteDoc } from 'firebase/firestore';
import { getDatabase, ref, set, onValue, update } from 'firebase/database';

// ⚠️ Bu dosya GitHub için hazırlanmış versiyondur.
// Gerçek key'ler .env dosyasından okunmalıdır.
// Projeyi çalıştırmak için .env.example dosyasını kopyalayıp
// kendi Firebase bilgilerinizle doldurun.
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

export const logAcActionToFirebase = async (payload: any, deviceName: string) => {
  try {
    const docRef = await addDoc(collection(db, 'ac_logs'), {
      deviceName: deviceName || 'Bilinmeyen Cihaz',
      payload: payload,
      timestamp: serverTimestamp(),
    });
    console.log('✅ Firebase Log Basarili (ID:', docRef.id, ')');
  } catch (error) {
    console.error('❌ Firebase Log Hatasi:', error);
  }
};

export const updateDevicePayload = async (deviceId: string, payload: any) => {
  try {
    const docRef = doc(db, 'devices', deviceId);
    await updateDoc(docRef, {
      payload: {
        ...payload,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Payload Guncelleme Hatasi:', error);
  }
};

export const updateDeviceStateRTDB = async (deviceId: string, payload: any) => {
  try {
    const stateRef = ref(rtdb, `devices/${deviceId}/state`);
    await set(stateRef, {
      ...payload,
      timestamp: new Date().getTime()
    });
  } catch (error) {
    console.error('❌ RTDB Guncelleme Hatasi:', error);
  }
};

export const updateAcStats = async (deviceId: string, turnedOn: boolean) => {
  try {
    const docRef = doc(db, 'devices', deviceId);
    if (turnedOn) {
      // Cihaz açıldı, lastTurnedOn zamanını kaydet
      await updateDoc(docRef, {
        lastTurnedOn: new Date().toISOString()
      });
    } else {
      // Cihaz kapandı, çalışma süresini hesapla
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lastTurnedOn) {
          const turnedOnDate = new Date(data.lastTurnedOn);
          const now = new Date();
          const diffMs = now.getTime() - turnedOnDate.getTime();
          const diffMins = Math.round(diffMs / 60000);
          
          if (diffMins > 0) {
            await updateDoc(docRef, {
              'stats.totalWorkingMinutes': increment(diffMins),
              lastTurnedOn: null
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ İstatistik Guncelleme Hatasi:', error);
  }
};

export const subscribeToDevicePayload = (deviceId: string, callback: (payload: any, stats?: any) => void) => {
  const docRef = doc(db, 'devices', deviceId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.payload) {
        callback(data.payload, data.stats);
      }
    }
  });
};

export const subscribeToRoomTempRTDB = (deviceId: string, callback: (temp: number) => void) => {
  const tempRef = ref(rtdb, `devices/${deviceId}/roomTemp`);
  return onValue(tempRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
};

export const subscribeToLastSeenRTDB = (deviceId: string, callback: (timestamp: number) => void) => {
  const lastSeenRef = ref(rtdb, `devices/${deviceId}/lastSeen`);
  return onValue(lastSeenRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
};

export const subscribeToAutomationRTDB = (deviceId: string, callback: (data: any) => void) => {
  const autoRef = ref(rtdb, `devices/${deviceId}/automation`);
  return onValue(autoRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
};

export const updateAutomationRTDB = async (deviceId: string, payload: any) => {
  try {
    const autoRef = ref(rtdb, `devices/${deviceId}/automation`);
    await set(autoRef, payload);
  } catch (error) {
    console.error('❌ Automation Guncelleme Hatasi:', error);
  }
};

export const registerNewDeviceToFirebase = async (userId: string, deviceData: any) => {
  try {
    const docRef = doc(db, 'users', userId, 'devices', deviceData.id);
    await setDoc(docRef, {
      ...deviceData,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Yeni cihaz ekleme hatasi:', error);
  }
};

export const deleteDeviceFromFirebase = async (userId: string, deviceId: string) => {
  try {
    // 1. ESP32'ye factoryReset emri yolla (RTDB üzerinden)
    const stateRef = ref(rtdb, `devices/${deviceId}/state`);
    await update(stateRef, { factoryReset: true });

    // 2. Kullanıcının Firestore cihaz listesinden sil
    const docRef = doc(db, 'users', userId, 'devices', deviceId);
    await deleteDoc(docRef);
    
    console.log(`Cihaz (${deviceId}) basariyla silindi ve reset emri gonderildi.`);
  } catch (error) {
    console.error('Cihaz silme hatasi:', error);
  }
};

export const sendNewWifiCredentials = async (deviceId: string, ssid: string, pass: string) => {
  try {
    const stateRef = ref(rtdb, `devices/${deviceId}/state`);
    await update(stateRef, { 
      newWifiSsid: ssid,
      newWifiPass: pass
    });
    console.log(`Cihaz (${deviceId}) WiFi degistirme emri gonderildi.`);
  } catch (error) {
    console.error('WiFi degistirme emri hatasi:', error);
  }
};

export const fetchMonthlyAcLogs = async (yearMonthStr: string) => {
  // yearMonthStr format: "YYYY-MM"
  try {
    const startDate = new Date(`${yearMonthStr}-01T00:00:00.000Z`);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    
    const logsRef = collection(db, 'ac_logs');
    const q = query(
      logsRef,
      where('timestamp', '>=', startDate),
      where('timestamp', '<', endDate),
      orderBy('timestamp', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const logs: any[] = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    return logs;
  } catch (error) {
    console.error('❌ Log getirme hatasi:', error);
    return [];
  }
};

export const logFilterCleaning = async (date: Date) => {
  try {
    await addDoc(collection(db, 'filter_logs'), {
      cleanedAt: date,
      timestamp: serverTimestamp(),
    });
    console.log('✅ Filtre temizliği kaydedildi.');
  } catch (error) {
    console.error('❌ Filtre log hatasi:', error);
  }
};

export const fetchLatestFilterLog = async (): Promise<Date | null> => {
  try {
    const logsRef = collection(db, 'filter_logs');
    const q = query(logsRef, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      if (data.cleanedAt) {
        if (data.cleanedAt.toDate) return data.cleanedAt.toDate();
        if (data.cleanedAt.seconds) return new Date(data.cleanedAt.seconds * 1000);
        return new Date(data.cleanedAt);
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Filtre verisi getirme hatasi:', error);
    return null;
  }
};

export const updateSettings = async (settingsData: any) => {
  try {
    const docRef = doc(db, 'app_settings', 'global_config');
    await setDoc(docRef, settingsData, { merge: true });
  } catch (error) {
    console.error('❌ Settings Guncelleme Hatasi:', error);
  }
};

export const syncInitialSettings = async (defaultSettings: any) => {
  try {
    const docRef = doc(db, 'app_settings', 'global_config');
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await setDoc(docRef, defaultSettings, { merge: true });
      console.log('✅ Firestore Settings dökümanı varsayılan değerlerle oluşturuldu.');
    }
  } catch (error) {
    console.error('❌ Initial Settings Senkronizasyon Hatasi:', error);
  }
};

export const subscribeToSettings = (callback: (data: any) => void) => {
  const docRef = doc(db, 'app_settings', 'global_config');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    }
  });
};
