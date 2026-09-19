import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import base64 from 'react-native-base64';

// ESP32 BLE Server Constants
export const ESP32_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const ESP32_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
export const ESP32_CHARACTERISTIC_UUID_RX = "12345678-1234-5678-1234-56789abcdef0"; // Yöntem B için okuma kanalı

class BleService {
  private manager: BleManager;

  constructor() {
    this.manager = new BleManager();
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Konum İzni',
            message: 'Bluetooth cihazlarını bulabilmek için konum iznine ihtiyacımız var.',
            buttonNeutral: 'Daha Sonra',
            buttonNegative: 'İptal',
            buttonPositive: 'Tamam',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
    return true; // iOS is handled automatically by OS
  }

  scanForESP32(
    onDeviceFound: (device: Device) => void,
    onError: (error: string) => void
  ) {
    this.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("BLE Scan Error:", error);
        onError(error.message);
        this.manager.stopDeviceScan();
        return;
      }

      // Check if device is our ESP32
      if (device && (device.name === 'Klimatik_ESP32' || device.localName === 'Klimatik_ESP32')) {
        this.manager.stopDeviceScan();
        onDeviceFound(device);
      }
    });

    // Auto stop scan after 10 seconds if not found
    setTimeout(() => {
      this.manager.stopDeviceScan();
    }, 10000);
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  // Yöntem B: ESP32'den Wi-Fi listesini okuma (Gelecekte kullanılacak)
  async getWifiNetworksFromDevice(device: Device): Promise<string[]> {
    try {
      console.log(`[BLE] Okuma için bağlanılıyor...`);
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      console.log(`[BLE] Wi-Fi listesi okunuyor...`);
      const characteristic = await connectedDevice.readCharacteristicForService(
        ESP32_SERVICE_UUID,
        ESP32_CHARACTERISTIC_UUID_RX
      );

      if (characteristic.value) {
        const decoded = base64.decode(characteristic.value);
        console.log(`[BLE] Okunan Veri:`, decoded);
        const networks = JSON.parse(decoded);
        return Array.isArray(networks) ? networks : [];
      }
      return [];
    } catch (error) {
      console.error("[BLE] Wi-Fi listesi okunamadı:", error);
      return [];
    }
  }

  async sendWifiCredentials(
    device: Device,
    ssid: string,
    pass: string,
    deviceId: string
  ): Promise<boolean> {
    try {
      console.log(`[BLE] Connecting to ${device.id}...`);
      const connectedDevice = await device.connect();
      
      console.log(`[BLE] Discovering services and characteristics...`);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      const payload = JSON.stringify({
        ssid: ssid,
        pass: pass,
        id: deviceId
      });
      
      const base64Payload = base64.encode(payload);

      console.log(`[BLE] Sending credentials to ESP32...`);
      await connectedDevice.writeCharacteristicWithResponseForService(
        ESP32_SERVICE_UUID,
        ESP32_CHARACTERISTIC_UUID,
        base64Payload
      );

      console.log(`[BLE] Credentials sent successfully!`);
      // Disconnect after sending
      await connectedDevice.cancelConnection();
      return true;
    } catch (error) {
      console.error("[BLE] Error sending credentials:", error);
      try {
        await device.cancelConnection();
      } catch (e) {}
      return false;
    }
  }

  destroy() {
    this.manager.destroy();
  }
}

export const bleService = new BleService();
