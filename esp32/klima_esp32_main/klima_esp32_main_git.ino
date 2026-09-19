#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Firebase_ESP_Client.h>
#include <IRrecv.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRutils.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ir_Midea.h>
#include <time.h>

// BLE Constants
#define BLE_SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ⚠️ Firebase Bilgileri — Kendi Firebase projenizin bilgilerini girin
// .env.example dosyasındaki açıklamalara bakın
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL                                                           \
  "YOUR_PROJECT_ID-default-rtdb.europe-west1.firebasedatabase.app"
#define PROJECT_ID "YOUR_PROJECT_ID"

Preferences preferences;
String deviceSsid = "";
String devicePassword = "";
String deviceDocId = "";
bool isBleProvisioning = false;
bool provisionedDataReceived = false;
bool bleTimeoutActive = false;
unsigned long bleStartTime = 0;

FirebaseData fbdo;
FirebaseData fbdoSensor;
FirebaseData fbdoAuto;
FirebaseAuth auth;
FirebaseConfig config;

// IR ve Sensör Pinleri
const uint16_t kIrLed = 14;
const uint16_t kRecvPin = 27;
const uint8_t kSensorPin = 34;
const uint8_t kButtonPin = 12;

IRMideaAC ac(kIrLed);

// FreeRTOS Görevleri ve Senkronizasyon (Mutex)
TaskHandle_t NetworkTaskHandle;
SemaphoreHandle_t stateMutex;

// Cihazın son bilinen durumu (Global State)
bool lastPower = false;
int lastTemp = 24;
String lastMode = "Cool";
String lastFanSpeed = "Auto";
String lastSwing = "Off";

// Core'lar arası haberleşme bayrakları
volatile bool newCommandReceived = false;
volatile bool sendSensorData = false;
volatile float currentRoomTemp = 24.5;
volatile bool physicalRemoteUsed = false;

// RADYO SESSİZLİĞİ (QUIET ZONE) BAYRAĞI
volatile bool isSensorReadingActive = false;

// İlk açılışta klimaya sinyal atmamak için bayrak
bool isFirstStreamRead = true;

// Otomasyon Durumu
struct ScenarioNode {
  int durationMinutes;
  bool power;
  int temp;
  String mode;
  String fanSpeed;
};
volatile bool autoRunning = false;
volatile int autoCurrentIndex = 0;
volatile int autoTotalNodes = 0;
volatile unsigned long autoNodeStartMillis = 0;
ScenarioNode autoNodes[10];
volatile bool advanceAutoNode = false;
volatile bool triggerAutoStart = false;

// Zamanlayıcılar
unsigned long lastSensorReadTime = 0;
const unsigned long sensorReadInterval =
    300 * 1000; // 5 dakika (Optimum sicaklik ve Firebase guncelleme araligi)

unsigned long lastHeartbeatTime = 0;
const unsigned long heartbeatInterval = 30000; // 30 saniye

bool lastButtonState = HIGH;
unsigned long buttonPressTime = 0; // Butona basilma ani (Long press icin)

// Fonksiyon prototipleri
void applyAcState();
void networkTask(void *pvParameters);
void startBLEProvisioning();

// BLE Callback Class
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String rxValue = pCharacteristic->getValue();
    if (rxValue.length() > 0) {
      Serial.println("[BLE] Alinan Veri:");
      String jsonStr = rxValue;
      Serial.println(jsonStr);

      FirebaseJson json;
      FirebaseJsonData jsonData;
      json.setJsonData(jsonStr);

      json.get(jsonData, "ssid");
      if (jsonData.success)
        deviceSsid = jsonData.stringValue;

      json.get(jsonData, "pass");
      if (jsonData.success)
        devicePassword = jsonData.stringValue;

      json.get(jsonData, "id");
      if (jsonData.success)
        deviceDocId = jsonData.stringValue;

      if (deviceSsid.length() > 0 && deviceDocId.length() > 0) {
        Serial.println(
            "[BLE] Gecerli bilgiler alindi, EEPROM'a kaydediliyor...");
        preferences.begin("klimatik", false);
        preferences.putString("ssid", deviceSsid);
        preferences.putString("pass", devicePassword);
        preferences.putString("docId", deviceDocId);
        preferences.end();

        provisionedDataReceived = true; // Reboot on main loop
      }
    }
  }
};

void setup() {
  Serial.begin(115200);

  pinMode(kButtonPin, INPUT_PULLUP);
  ac.begin();

  // NVS'den bilgileri oku
  preferences.begin("klimatik", false);
  deviceSsid = preferences.getString("ssid", "");
  devicePassword = preferences.getString("pass", "");
  deviceDocId = preferences.getString("docId", "");
  bool forceBLE = preferences.getBool("forceBLE", false);

  // Eğer forceBLE true ise, sadece 1 seferlik olduğu için hemen false yap.
  if (forceBLE) {
    preferences.putBool("forceBLE", false);
  }
  preferences.end();

  // Eğer butona basılı tutularak açıldıysa, sıfırlama modu
  if (digitalRead(kButtonPin) == LOW) {
    Serial.println("Sifirlama tusu basili! EEPROM Temizleniyor...");
    preferences.begin("klimatik", false);
    preferences.clear();
    preferences.end();
    deviceSsid = "";
  }

  // Mutex oluştur
  stateMutex = xSemaphoreCreateMutex();

  if (deviceSsid == "" || deviceDocId == "") {
    isBleProvisioning = true;
    startBLEProvisioning();
  } else if (forceBLE) {
    // Eşleşme modu istendiyse BLE'yi aç ama main loop'u kilitleme
    // (isBleProvisioning = false kalır)
    startBLEProvisioning();
    bleTimeoutActive = true;
    bleStartTime = millis();
  } else {
    // BLE'yi deinit ederek RAM'i boşaltıyoruz (Sadece normal modda)
    BLEDevice::deinit(true);
  }

  // Eğer Wi-Fi bilgileri varsa, BLE açık olsa bile Wi-Fi ağına da bağlanıp
  // normal çalışmaya devam eder
  if (deviceSsid != "" && deviceDocId != "") {
    // Core 0 üzerinde Ağ Görevini (WiFi ve Firebase) Başlat
    xTaskCreatePinnedToCore(networkTask, "NetworkTask", 10000, NULL, 1,
                            &NetworkTaskHandle, 0);
    Serial.println("Sistem Baslatildi. Ag islemleri Core 0'da, Donanim "
                   "islemleri Core 1'de (Loop) calisiyor.");
  }
}

void setupNTP() {
  configTime(3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[CORE 0] NTP bekleniyor");
  time_t now = time(nullptr);
  int retries = 0;
  while (now < 24 * 3600 && retries < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    retries++;
  }
  if (now > 24 * 3600) {
    Serial.println("\n[CORE 0] NTP basarili! Zaman: " + String(now));
  } else {
    Serial.println("\n[CORE 0] NTP alinamadi.");
  }
}

void startBLEProvisioning() {
  Serial.println("BLE Provisioning Baslatiliyor...");
  BLEDevice::init("Klimatik_ESP32");
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(BLE_SERVICE_UUID);

  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
      BLE_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("BLE Sunucusu yayinda, telefon baglantisi bekleniyor...");
}

// ----------------------------------------------------
// CORE 1 (DONANIM GÖREVLERİ - STANDART LOOP)
// ----------------------------------------------------
void loop() {
  // İlk kurulum modundaysa (Wi-Fi yoksa) sadece bekle ve reboot'u kontrol et
  if (isBleProvisioning) {
    if (provisionedDataReceived) {
      Serial.println("[BLE] Kurulum tamamlandi. Cihaz yeniden baslatiliyor...");
      delay(2000);
      ESP.restart();
    }
    delay(100);
    return;
  }

  // 3 Dakikalık Eşleşme Modu Zamanlayıcısı (Ana döngüyü engellemez)
  if (bleTimeoutActive) {
    if (millis() - bleStartTime > 3 * 60 * 1000) {
      Serial.println(
          "[CORE 1] 3 Dakika doldu, BLE zaman asimina ugradi. Kapatiliyor...");
      BLEDevice::deinit(true);
      bleTimeoutActive = false;
    }
    if (provisionedDataReceived) {
      Serial.println(
          "[BLE] 2. Cihaz Kurulumu tamamlandi. Yeniden baslatiliyor...");
      delay(2000);
      ESP.restart();
    }
  }

  bool triggerAc = false;

  // 1. Core 0'dan yeni bir Firebase komutu geldi mi?
  if (newCommandReceived) {
    xSemaphoreTake(stateMutex, portMAX_DELAY);
    newCommandReceived = false;
    triggerAc = true;
    if (autoRunning) {
      Serial.println("[CORE 1] Manuel komut geldi, otomasyon IPTAL ediliyor!");
      autoRunning = false;
      advanceAutoNode = true;
    }
    xSemaphoreGive(stateMutex);
  }

  // 1.1. Otomasyon İlk Başlangıç Komutu
  if (triggerAutoStart) {
    xSemaphoreTake(stateMutex, portMAX_DELAY);
    triggerAutoStart = false;
    if (autoRunning && autoCurrentIndex < autoTotalNodes) {
      Serial.println(
          "[CORE 1] Otomasyon basladi, ilk adim klimaya gonderiliyor.");
      lastPower = autoNodes[autoCurrentIndex].power;
      lastTemp = autoNodes[autoCurrentIndex].temp;
      lastMode = autoNodes[autoCurrentIndex].mode;
      lastFanSpeed = autoNodes[autoCurrentIndex].fanSpeed;
      triggerAc = true;
    }
    xSemaphoreGive(stateMutex);
  }

  // 1.5. Otomasyon Kronometresi
  if (autoRunning && autoTotalNodes > 0 && autoCurrentIndex < autoTotalNodes) {
    unsigned long elapsedMillis = millis() - autoNodeStartMillis;
    unsigned long requiredMillis =
        autoNodes[autoCurrentIndex].durationMinutes * 60000UL;

    if (elapsedMillis >= requiredMillis) {
      Serial.println(
          "[CORE 1] Otomasyon node suresi doldu. Sonraki adima geciliyor.");
      autoCurrentIndex++;

      if (autoCurrentIndex < autoTotalNodes) {
        lastPower = autoNodes[autoCurrentIndex].power;
        lastTemp = autoNodes[autoCurrentIndex].temp;
        lastMode = autoNodes[autoCurrentIndex].mode;
        lastFanSpeed = autoNodes[autoCurrentIndex].fanSpeed;
        triggerAc = true;
        autoNodeStartMillis = millis();
        advanceAutoNode = true;
      } else {
        autoRunning = false;
        advanceAutoNode = true;
      }
    }
  }

  // 2. FİZİKSEL BUTON OKUMA (Kısa ve Uzun Basım)
  bool currentButtonState = digitalRead(kButtonPin);

  if (lastButtonState == HIGH && currentButtonState == LOW) {
    // Butona basıldığı an
    buttonPressTime = millis();
    Serial.println("[CORE 1] Butona basildi. Sure olculuyor...");
  } else if (lastButtonState == LOW && currentButtonState == HIGH) {
    // Butondan el çekildiği an
    unsigned long pressDuration = millis() - buttonPressTime;
    Serial.println("[CORE 1] Buton birakildi. Basili kalma suresi: " +
                   String(pressDuration) + " ms");

    if (pressDuration >= 5000) {
      // 5 Saniye Basılı Tutuldu - FACTORY RESET
      Serial.println("[CORE 1] 5 SANIYE BASILI TUTULDU! CIHAZ SIFIRLANIYOR "
                     "(FACTORY RESET)...");
      preferences.begin("klimatik", false);
      preferences.clear();
      preferences.end();
      ESP.restart();
    } else if (pressDuration >= 1000) {
      // 1 Saniye ile 5 Saniye arası basım - EŞLEŞME MODU (PAIRING MODE)
      Serial.println("[CORE 1] Eslesme Modu Istendi! (1-5 sn arasi basildi). "
                     "Cihaz BLE ile yeniden baslatiliyor...");
      preferences.begin("klimatik", false);
      preferences.putBool("forceBLE", true);
      preferences.end();
      ESP.restart();
    } else if (pressDuration >= 50) { // Debounce
      // Çok Kısa Basım (1 saniyeden az)
      Serial.println("[CORE 1] Butona Cok Kisa Basildi (" +
                     String(pressDuration) +
                     " ms). Klima Durumu Degistiriliyor...");
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      lastPower = !lastPower;
      lastTemp = 24;
      physicalRemoteUsed = true;
      triggerAc = true;
      if (autoRunning) {
        Serial.println("[CORE 1] Butona basildi, otomasyon IPTAL ediliyor!");
        autoRunning = false;
        advanceAutoNode = true;
      }
      xSemaphoreGive(stateMutex);
    }
  }
  lastButtonState = currentButtonState;

  // 3. KLİMAYA IR SİNYALİ GÖNDERME
  if (triggerAc) {
    applyAcState();
  }

  // 4. ODA SICAKLIĞI
  if (millis() - lastSensorReadTime > sensorReadInterval ||
      lastSensorReadTime == 0) {
    lastSensorReadTime = millis();

    // RADYO SESSİZLİĞİ (QUIET ZONE) BAŞLANGICI
    isSensorReadingActive = true;
    vTaskDelay(20 / portTICK_PERIOD_MS); // Core 0'ın o anki işlemi bitirmesi
                                         // için kısa bir süre tanı

    // ADC Isınma / Boş Okuma (Dummy Read)
    // ESP32 ADC uyku modundan çıkarken veya Wi-Fi sonrası ilk okumalar 0
    // gelebilir. Bu yüzden 5 adet boş okuma yaparak ADC hattını stabilize
    // ediyoruz.
    for (int i = 0; i < 5; i++) {
      analogRead(kSensorPin);
      delay(5);
    }

    // 1. KAPICI (GATEKEEPER) KONTROLÜ
    int readings[11];
    int validCount = 0;
    int attemptCount = 0; // Sonsuz döngü koruması

    // Geçerli 11 adet okuma (210 - 500 arası) toplanana kadar veya maksimum 50
    // denemeye ulaşana kadar okuma yap
    while (validCount < 11 && attemptCount < 50) {
      int val = analogRead(kSensorPin);
      attemptCount++;

      // Sadece 210 ile 500 (yaklaşık 17°C - 40°C) arasındaki değerleri diziye
      // ekle
      if (val >= 210 && val <= 500) {
        readings[validCount] = val;
        validCount++;
      }
      delay(15);
    }

    // Failsafe: Sensör kopuksa ve 50 denemede 11 değer bulunamadıysa diziyi
    // standart bir değerle (~24.5C) doldur
    if (validCount < 11) {
      for (int i = validCount; i < 11; i++) {
        readings[i] = 304;
      }
    }

    // 2. SIRALAMA VE KIRPILMIŞ ORTALAMA (TRIMMED MEAN)
    // Diziyi küçükten büyüğe doğru sırala (Bubble Sort)
    for (int i = 0; i < 10; i++) {
      for (int j = 0; j < 10 - i; j++) {
        if (readings[j] > readings[j + 1]) {
          int temp = readings[j];
          readings[j] = readings[j + 1];
          readings[j + 1] = temp;
        }
      }
    }

    // Dizideki en küçük 2 ve en büyük 2 elemanı yoksayarak ortadaki 7 elemanın
    // toplamını al
    long trimmedSum = 0;
    for (int i = 2; i <= 8; i++) {
      trimmedSum += readings[i];
    }

    // Kırpılmış ortalamayı hesapla
    float trimmedMean = trimmedSum / 7.0;

    // 3. HESAPLAMA VE LOGLAMA
    float voltage = (trimmedMean / 4095.0) * 3.3;
    float roomTemp = voltage * 100.0;

    String arrayStr = "[";
    for (int i = 0; i < 11; i++) {
      arrayStr += String(readings[i]);
      if (i < 10)
        arrayStr += ", ";
    }
    arrayStr += "]";

    Serial.println("==============================");
    Serial.println("[CORE 1] LM35 GATEKEEPER & TRIMMED MEAN TESTI:");
    Serial.println(" -> Siralanmis 11 Gecerli Okuma: " + arrayStr);
    Serial.println(" -> Kirpilmis Kalan 7 Degerin Ortalamasi: " +
                   String(trimmedMean));
    Serial.println(" -> Okunan Voltaj: " + String(voltage) + "V");
    Serial.println(" -> Hesaplanmis Sicaklik: " + String(roomTemp) + " C");
    Serial.println("==============================");

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    currentRoomTemp = roomTemp;
    sendSensorData = true;
    xSemaphoreGive(stateMutex);

    // RADYO SESSİZLİĞİ (QUIET ZONE) BİTİŞİ
    isSensorReadingActive = false;
  }

  vTaskDelay(10 / portTICK_PERIOD_MS);
}

// ----------------------------------------------------
// CORE 0 (AĞ GÖREVLERİ - WİFİ VE FİREBASE)
// ----------------------------------------------------
void networkTask(void *pvParameters) {
  Serial.println("[CORE 0] WiFi Baglaniyor: " + deviceSsid);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(deviceSsid.c_str(), devicePassword.c_str());

  unsigned long startAttemptTime = millis();

  while (WiFi.status() != WL_CONNECTED) {
    vTaskDelay(500 / portTICK_PERIOD_MS);
    Serial.print(".");
    if (millis() - startAttemptTime > 20000) { // 20 saniye zaman asimi
      Serial.println("\n[CORE 0] WiFi Baglanamadi! Cihaz yeniden baslatilip "
                     "tekrar denenecek...");
      ESP.restart(); // Sadece yeniden başlat, şifreyi SİLME!
    }
  }
  Serial.println("\n[CORE 0] WiFi Baglandi!");

  setupNTP();

  // Firebase Kurulumu
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true;
  Firebase.begin(&config, &auth);

  String streamPath = "/devices/" + deviceDocId + "/state";
  if (!Firebase.RTDB.beginStream(&fbdo, streamPath.c_str())) {
    Serial.println("[CORE 0] RTDB Stream Hatasi: " + fbdo.errorReason());
  } else {
    Serial.println("[CORE 0] RTDB Stream Basariyla Baslatildi! Dinlenen ID: " +
                   deviceDocId);
  }

  String autoPath = "/devices/" + deviceDocId + "/automation";
  Firebase.RTDB.beginStream(&fbdoAuto, autoPath.c_str());

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[CORE 0] WiFi Baglantisi Koptu! (Zombi Korumasi) Cihaz 3 "
                     "saniye icinde yeniden baslatiliyor...");
      vTaskDelay(3000 / portTICK_PERIOD_MS);
      ESP.restart();
    }

    // SENSÖR OKUNURKEN WI-FI VERİ GÖNDERİMİNİ (TX) DURDUR
    if (isSensorReadingActive) {
      vTaskDelay(10 / portTICK_PERIOD_MS);
      continue;
    }

    if (Firebase.ready()) {
      if (!Firebase.RTDB.readStream(&fbdo)) {
      }
      if (fbdo.streamAvailable()) {
        if (fbdo.dataType() == "json") {
          FirebaseJson &json = fbdo.jsonObject();
          FirebaseJsonData jsonData;

          Serial.println("[CORE 0] RTDB'den yeni komut geldi!");

          xSemaphoreTake(stateMutex, portMAX_DELAY);

          json.get(jsonData, "power");
          if (jsonData.success)
            lastPower = jsonData.boolValue;

          json.get(jsonData, "temp");
          if (jsonData.success)
            lastTemp = jsonData.intValue;

          json.get(jsonData, "mode");
          if (jsonData.success)
            lastMode = jsonData.stringValue;

          json.get(jsonData, "fanSpeed");
          if (jsonData.success)
            lastFanSpeed = jsonData.stringValue;

          json.get(jsonData, "swing");
          if (jsonData.success)
            lastSwing = jsonData.stringValue;

          json.get(jsonData, "factoryReset");
          if (jsonData.success && jsonData.boolValue == true) {
            Serial.println(
                "[CORE 0] BULUTTAN CIHAZ SILME (FACTORY RESET) EMRİ GELDI!");
            preferences.begin("klimatik", false);
            preferences.clear();
            preferences.end();
            ESP.restart();
          }

          json.get(jsonData, "deviceName");
          String senderDevice = "";
          if (jsonData.success) {
            senderDevice = jsonData.stringValue;
          }

          if (isFirstStreamRead) {
            Serial.println("[CORE 0] Ilk baglanti senkronizasyonu yapildi, "
                           "sinyal gonderilmeyecek.");
            isFirstStreamRead = false;
          } else if (senderDevice != "Otomasyon (ESP32)") {
            newCommandReceived = true;
          } else {
            Serial.println("[CORE 0] Kendi gonderdigimiz otomasyon durumu yansimasi, yoksayiliyor.");
          }

          xSemaphoreGive(stateMutex);
        }
      }
    }

    // --- AUTOMATION STREAM ---
    if (Firebase.ready()) {
      if (Firebase.RTDB.readStream(&fbdoAuto)) {
        if (fbdoAuto.streamAvailable() && fbdoAuto.dataType() == "json") {
          FirebaseJson &json = fbdoAuto.jsonObject();
          FirebaseJsonData jsonData;

          xSemaphoreTake(stateMutex, portMAX_DELAY);
          json.get(jsonData, "status");
          if (jsonData.success) {
            if (jsonData.stringValue == "RUNNING") {
              if (!autoRunning) {
                autoRunning = true;
                triggerAutoStart = true;
                autoNodeStartMillis = millis();
              }
              json.get(jsonData, "currentNodeIndex");
              if (jsonData.success)
                autoCurrentIndex = jsonData.intValue;
              json.get(jsonData, "totalNodes");
              if (jsonData.success)
                autoTotalNodes = jsonData.intValue;
              for (int i = 0; i < autoTotalNodes && i < 10; i++) {
                String basePathArray = "nodes/[" + String(i) + "]/";
                String basePathObj = "nodes/" + String(i) + "/";
                String basePath = basePathArray;

                // Dizi formatını (array) veya obje formatını desteklemek için
                // kontrol et
                json.get(jsonData, basePathArray + "durationMinutes");
                if (!jsonData.success) {
                  basePath = basePathObj;
                }

                json.get(jsonData, basePath + "durationMinutes");
                if (jsonData.success)
                  autoNodes[i].durationMinutes = jsonData.intValue;
                json.get(jsonData, basePath + "power");
                if (jsonData.success)
                  autoNodes[i].power = jsonData.boolValue;
                json.get(jsonData, basePath + "temp");
                if (jsonData.success)
                  autoNodes[i].temp = jsonData.intValue;
                json.get(jsonData, basePath + "mode");
                if (jsonData.success)
                  autoNodes[i].mode = jsonData.stringValue;
                json.get(jsonData, basePath + "fanSpeed");
                if (jsonData.success)
                  autoNodes[i].fanSpeed = jsonData.stringValue;
              }
              Serial.println("[CORE 0] Otomasyon basladi! Index: " +
                             String(autoCurrentIndex));
            } else {
              autoRunning = false;
              Serial.println("[CORE 0] Otomasyon durduruldu.");
            }
          }
          xSemaphoreGive(stateMutex);
        }
      }
    }

    if (sendSensorData && Firebase.ready()) {
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      float tempToSend = currentRoomTemp;
      sendSensorData = false;
      xSemaphoreGive(stateMutex);

      String path = "/devices/" + deviceDocId + "/roomTemp";
      if (Firebase.RTDB.setFloat(&fbdoSensor, path.c_str(), tempToSend)) {
        Serial.println("[CORE 0] Sicaklik RTDB'ye basariyla gonderildi.");
      }
    }

    if (physicalRemoteUsed && Firebase.ready()) {
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      FirebaseJson content;
      content.set("power", lastPower);
      content.set("temp", lastTemp);
      content.set("mode", lastMode);
      content.set("fanSpeed", lastFanSpeed);
      content.set("swing", lastSwing);
      content.set("deviceName", "Fiziksel Buton");
      physicalRemoteUsed = false;
      xSemaphoreGive(stateMutex);

      String path = "/devices/" + deviceDocId + "/state";
      if (Firebase.RTDB.setJSON(&fbdoSensor, path.c_str(), &content)) {
        Serial.println("[CORE 0] Buton islemi RTDB'ye basariyla guncellendi.");
      }
    }

    if (Firebase.ready() && (millis() - lastHeartbeatTime > heartbeatInterval ||
                             lastHeartbeatTime == 0)) {
      lastHeartbeatTime = millis();
      FirebaseJson tsJson;
      tsJson.set(".sv", "timestamp");
      String hbPath = "/devices/" + deviceDocId + "/lastSeen";
      if (Firebase.RTDB.setJSON(&fbdoSensor, hbPath.c_str(), &tsJson)) {
        Serial.println("[CORE 0] Heartbeat (lastSeen) basariyla gonderildi.");
      }
    }

    // --- OTOMASYON İLERLEMESİNİ FİREBASE'E BİLDİR ---
    if (advanceAutoNode && Firebase.ready()) {
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      int currentIndex = autoCurrentIndex;
      bool isRunning = autoRunning;
      advanceAutoNode = false;

      FirebaseJson stateContent;
      stateContent.set("power", lastPower);
      stateContent.set("temp", lastTemp);
      stateContent.set("mode", lastMode);
      stateContent.set("fanSpeed", lastFanSpeed);
      stateContent.set("swing", lastSwing);
      stateContent.set("deviceName", "Otomasyon (ESP32)");
      xSemaphoreGive(stateMutex);

      if (isRunning) {
        String path =
            "/devices/" + deviceDocId + "/automation/currentNodeIndex";
        Firebase.RTDB.setInt(&fbdoSensor, path.c_str(), currentIndex);

        time_t now = time(nullptr);
        if (now > 24 * 3600) {
          String pathTime =
              "/devices/" + deviceDocId + "/automation/nodeStartedAt";
          double epochMs = (double)now * 1000.0;
          Firebase.RTDB.setDouble(&fbdoSensor, pathTime.c_str(), epochMs);
        }
      } else {
        String path = "/devices/" + deviceDocId + "/automation/status";
        Firebase.RTDB.setString(&fbdoSensor, path.c_str(), "CANCELLED");
      }

      String statePath = "/devices/" + deviceDocId + "/state";
      Firebase.RTDB.setJSON(&fbdoSensor, statePath.c_str(), &stateContent);
    }

    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// ----------------------------------------------------
// KLİMAYA SİNYAL GÖNDERME (SADECE CORE 1 ÇALIŞTIRIR)
// ----------------------------------------------------
void applyAcState() {
  Serial.println("[CORE 1] IR Sinyali Hazirlaniyor...");

  IRMideaAC freshAc(kIrLed);
  freshAc.begin();
  freshAc.setUseCelsius(true);

  xSemaphoreTake(stateMutex, portMAX_DELAY);

  if (lastPower)
    freshAc.on();
  else
    freshAc.off();

  freshAc.setTemp(lastTemp, true);

  if (lastMode == "Cool")
    freshAc.setMode(kMideaACCool);
  else if (lastMode == "Heat")
    freshAc.setMode(kMideaACHeat);
  else if (lastMode == "Dry")
    freshAc.setMode(kMideaACDry);
  else if (lastMode == "Fan")
    freshAc.setMode(kMideaACFan);
  else if (lastMode == "Auto")
    freshAc.setMode(kMideaACAuto);

  if (lastFanSpeed == "Auto")
    freshAc.setFan(kMideaACFanAuto);
  else if (lastFanSpeed == "1" || lastFanSpeed == "Low")
    freshAc.setFan(kMideaACFanLow);
  else if (lastFanSpeed == "2" || lastFanSpeed == "Med")
    freshAc.setFan(kMideaACFanMed);
  else if (lastFanSpeed == "3" || lastFanSpeed == "Turbo")
    freshAc.setFan(kMideaACFanHigh);

  if (lastSwing == "On")
    freshAc.setSwingVToggle(true);
  else
    freshAc.setSwingVToggle(false);

  xSemaphoreGive(stateMutex);

  freshAc.send();
  vTaskDelay(200 / portTICK_PERIOD_MS); // 200 ms bekleme (garanti olsun diye)
  freshAc.send();
  Serial.println(
      "[CORE 1] IR Sinyali Cift Dikisle (2 kez) TERTEMIZ Gonderildi!");
}
