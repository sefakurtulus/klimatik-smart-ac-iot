import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWeatherData } from '../services/weatherService';
import { logAcActionToFirebase, updateDevicePayload, updateAcStats, subscribeToDevicePayload, updateDeviceStateRTDB, subscribeToRoomTempRTDB, subscribeToLastSeenRTDB, updateSettings, subscribeToSettings, syncInitialSettings, updateAutomationRTDB, subscribeToAutomationRTDB } from '../services/firebaseService';
import { ESP_LOCAL_URL } from '../constants/api';

let unsubDevicePayload: (() => void) | null = null;
let unsubRoomTemp: (() => void) | null = null;
let unsubLastSeen: (() => void) | null = null;
let unsubAutomation: (() => void) | null = null;

export type AcMode = 'Cool' | 'Dry' | 'Heat' | 'Fan' | 'Auto';
export type FanSpeed = 'Auto' | '1' | '2' | '3' | 'Turbo';
export type SwingState = 'Off' | 'On';

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  runTime: number; // hours
  energy: number; // kWh
  cost: number; // TL
}

export interface Device {
  id: string;
  name: string;
  ssid?: string;
}

export interface ScenarioNode {
  id: string;
  stepOrder: number;
  power: boolean;
  temp: number;
  mode: AcMode;
  fanSpeed: FanSpeed;
  durationMinutes: number;
}

export interface Scenario {
  id: string;
  name: string;
  icon: string;
  createdAt: number;
  nodes: ScenarioNode[];
}

export interface ActiveSession {
  scenarioId: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED";
  startedAt: number;
  currentNodeIndex: number;
  nodeStartedAt: number;
  totalDurationMinutes: number;
}

export interface AcState {
  isOn: boolean;
  targetTemp: number;
  currentTemp: number; // from ESP32 DHT22
  humidity: number;
  mode: AcMode;
  fanSpeed: FanSpeed;
  swing: SwingState;
  sleep: boolean;
  turbo: boolean;
  isOnline: boolean;
  lastSeen: Date;
  dailyConsumption: number; // kWh
  dailyCost: number; // TL
  dailyRunTime: number; // hours
  ipAddress: string;
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  devMode: boolean;
  lastBillAmount: number; // TL
  lastBillConsumption: number; // kWh
  lastBillDays: number; // Days in the billing period
  monthlyConsumption: number; // kWh (for the current month)
  usageHistory: DailyUsage[];
  deviceName: string;
  weather: {
    temp: number | null,
    feelsLike: number | null,
    humidity: number | null,
    windSpeed: number | null,
    description: string | null,
    icon: string | null,
    hourly: any[] | null,
    loading: boolean
  };
  isEspEnabled: boolean;
  totalWorkingMinutes: number;
  roomTemp: number | null;
  monthlyBaseConsumption: Record<number, number>;
  dusukTarifeFiyat: number;
  yuksekTarifeFiyat: number;
  scenarios: Scenario[];
  activeSession: ActiveSession | null;
  activeDeviceId: string | null;
  devices: Device[];
}

export interface AcActions {
  togglePower: () => void;
  setTargetTemp: (temp: number) => void;
  setMode: (mode: AcMode) => void;
  setFanSpeed: (speed: FanSpeed) => void;
  setSwing: (swing: SwingState) => void;
  toggleSleep: () => void;
  toggleTurbo: () => void;
  setIpAddress: (ip: string) => void;
  setDeviceName: (name: string) => void;
  fetchWeather: () => Promise<void>;
  toggleDarkMode: () => void;
  toggleNotifications: () => void;
  toggleDevMode: () => void;
  setBillData: (amount: number, consumption: number, days: number) => void;
  syncExternalData: (runTime: number, energy: number) => void;
  getBaseUnitPrice: () => number;
  getDailyCost: () => number;
  getMonthlyCost: () => number;
  syncWithESP: () => Promise<void>;
  applyAndSync: (localState: Partial<AcState>) => void;
  toggleEspEnabled: () => void;
  initFirebaseListener: () => void;
  checkOnlineStatus: () => void;
  setTariffData: (matrix: Record<number, number>, dusuk: number, yuksek: number) => void;
  saveScenario: (scenario: Scenario) => void;
  deleteScenario: (id: string) => void;
  startAutomation: (scenarioId: string) => void;
  stopAutomation: () => void;
  setActiveDeviceId: (id: string | null) => void;
  addDevice: (device: Device) => void;
  updateDevice: (deviceId: string, updates: Partial<Device>) => void;
  removeDevice: (id: string) => void;
}

export const useAcStore = create<AcState & AcActions>()(
  persist(
    (set, get) => ({
      // Initial state
      isOn: true,
      targetTemp: 26,
      currentTemp: 26.5,
      humidity: 57,
      mode: 'Cool',
      fanSpeed: 'Auto',
      swing: 'Off',
      sleep: false,
      turbo: false,
      isOnline: true,
      lastSeen: new Date(),
      dailyConsumption: 0,
      dailyCost: 0,
      dailyRunTime: 0,
      ipAddress: '192.168.1.100',
      isDarkMode: true,
      notificationsEnabled: true,
      devMode: false,
      lastBillAmount: 500,
      lastBillConsumption: 200,
      lastBillDays: 30,
      monthlyConsumption: 0,
      usageHistory: [],
      deviceName: 'Ramazan',
      weather: { temp: null, feelsLike: null, humidity: null, windSpeed: null, description: null, icon: null, hourly: null, loading: false },
      isEspEnabled: true,
      totalWorkingMinutes: 0,
      roomTemp: null,
      monthlyBaseConsumption: {
        1: 310, 2: 240, 3: 260, 4: 350, 5: 230, 6: 225,
        7: 185, 8: 200, 9: 180, 10: 195, 11: 180, 12: 220
      },
      dusukTarifeFiyat: 2.07,
      yuksekTarifeFiyat: 3.10,
      scenarios: [
        {
          id: 'sc_001',
          name: 'Gece Soğutma Protokolü',
          icon: 'moon-waning-crescent',
          createdAt: Date.now(),
          nodes: [
            { id: 'n1', stepOrder: 1, power: true, temp: 22, mode: 'Cool', fanSpeed: 'Auto', durationMinutes: 60 },
            { id: 'n2', stepOrder: 2, power: true, temp: 25, mode: 'Cool', fanSpeed: '1', durationMinutes: 240 },
            { id: 'n3', stepOrder: 3, power: false, temp: 25, mode: 'Cool', fanSpeed: '1', durationMinutes: 1 }
          ]
        }
      ],
      activeSession: null,
      activeDeviceId: null,
      devices: [{ id: 'ObKLfsmN6nxucdyrB76m', name: 'Geliştirici Cihazı' }],

      // Actions
      togglePower: () => {
        const nextPower = !get().isOn;
        set({ isOn: nextPower });
        const state = get();
        if (state.activeDeviceId) {
          updateAcStats(state.activeDeviceId, nextPower);
        }
      },
      setTargetTemp: (temp) => {
        set({ targetTemp: temp });
      },
      setMode: (mode) => {
        set((state) => ({
          mode,
          ...(mode === 'Dry' ? { fanSpeed: 'Auto' } : {})
        }));
      },
      setFanSpeed: (speed) => {
        set({ fanSpeed: speed });
      },
      setSwing: (swing) => {
        set({ swing });
      },
      toggleSleep: () => set((state) => ({ sleep: !state.sleep, turbo: false })),
      toggleTurbo: () => set((state) => {
        const nextTurbo = !state.turbo;
        return {
          turbo: nextTurbo,
          ...(nextTurbo ? { sleep: false } : {})
        };
      }),
      setIpAddress: (ip) => set({ ipAddress: ip }),
      setDeviceName: (name) => set({ deviceName: name }),
      fetchWeather: async () => {
        set((state) => ({ weather: { ...state.weather, loading: true } }));
        const data = await fetchWeatherData();
        set({
          weather: {
            temp: data.temp,
            feelsLike: data.feelsLike,
            humidity: data.humidity,
            windSpeed: data.windSpeed,
            description: data.description,
            icon: null,
            hourly: data.hourly,
            loading: false
          }
        });
      },
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      toggleNotifications: () => set((state) => ({ notificationsEnabled: !state.notificationsEnabled })),
      toggleEspEnabled: () => set((state) => ({ isEspEnabled: !state.isEspEnabled })),
      toggleDevMode: () => set((state) => ({ devMode: !state.devMode })),
      setBillData: (amount, consumption, days) => set({ lastBillAmount: amount, lastBillConsumption: consumption, lastBillDays: days }),
      syncExternalData: (runTime, energy) => set((state) => {
        const today = new Date().toISOString().split('T')[0];
        const newHistory = [...state.usageHistory];
        const existingIndex = newHistory.findIndex(h => h.date === today);

        // Calculate new cost based on updated energy and dynamic base price
        const baseRate = state.lastBillConsumption === 0 ? 2.07 : (
          state.lastBillConsumption <= state.lastBillDays * 8
            ? state.lastBillAmount / state.lastBillConsumption
            : state.lastBillAmount / ((state.lastBillDays * 8) + (state.lastBillConsumption - state.lastBillDays * 8) * 1.5)
        );
        const addedCost = energy * baseRate; // Simplistic assignment for external sync

        if (existingIndex >= 0) {
          newHistory[existingIndex] = {
            ...newHistory[existingIndex],
            runTime: newHistory[existingIndex].runTime + runTime,
            energy: newHistory[existingIndex].energy + energy,
            cost: newHistory[existingIndex].cost + addedCost,
          };
        } else {
          newHistory.push({ date: today, runTime, energy, cost: addedCost });
        }

        return {
          usageHistory: newHistory,
          dailyConsumption: state.dailyConsumption + energy,
          dailyRunTime: state.dailyRunTime + runTime,
          monthlyConsumption: state.monthlyConsumption + energy,
        };
      }),
      getBaseUnitPrice: () => {
        const state = get();
        if (state.lastBillConsumption === 0) return 2.07; // Default fallback
        const limit = state.lastBillDays * 8;
        if (state.lastBillConsumption <= limit) {
          return state.lastBillAmount / state.lastBillConsumption;
        } else {
          return state.lastBillAmount / (limit + (state.lastBillConsumption - limit) * 1.5);
        }
      },
      getDailyCost: () => {
        const state = get();
        const baseRate = state.getBaseUnitPrice();
        const limit = 30 * 8; // Assuming 30 days for the current month
        // If monthly total exceeds limit, the daily consumption is charged at 1.5x
        const rate = state.monthlyConsumption > limit ? baseRate * 1.5 : baseRate;
        return Number((state.dailyConsumption * rate).toFixed(2));
      },
      getMonthlyCost: () => {
        const state = get();
        const baseRate = state.getBaseUnitPrice();
        const limit = 30 * 8; // Standard 30 day limit = 240
        if (state.monthlyConsumption <= limit) {
          return Number((state.monthlyConsumption * baseRate).toFixed(2));
        } else {
          const baseCost = limit * baseRate;
          const excessCost = (state.monthlyConsumption - limit) * (baseRate * 1.5);
          return Number((baseCost + excessCost).toFixed(2));
        }
      },
      syncWithESP: async () => {
        const state = get();
        if (!state.activeDeviceId) return;

        const payload = {
          power: state.isOn,
          temp: state.targetTemp,
          mode: state.mode,
          fanSpeed: state.fanSpeed,
          swing: state.swing,
          deviceName: state.deviceName,
        };
        console.log('Firebase Payload Guncelleniyor:', JSON.stringify(payload));

        logAcActionToFirebase(payload, state.deviceName);
        updateDeviceStateRTDB(state.activeDeviceId, payload);
        updateDevicePayload(state.activeDeviceId, payload);

        if (!state.isEspEnabled) {
          console.log('⚠️ ESP32 İletişimi kapalı (Arayüz Test Modu). Yerel HTTP ESP isteği atlandı.');
          return;
        }

        // Opsiyonel: Hâlâ doğrudan HTTP kullanmak istiyorsan bu blok çalışır.
        try {
          const targetUrl = state.ipAddress ? `http://${state.ipAddress}/api/ac` : ESP_LOCAL_URL;
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            console.warn('ESP32 yanit hatasi:', response.status);
          }
        } catch (error) {
          console.error('Network Request Failed (ESP32):', error);
        }
      },
      applyAndSync: (localState) => {
        set((state) => ({ ...state, ...localState }));
        const state = get();
        if (localState.isOn !== undefined && state.activeDeviceId) {
          updateAcStats(state.activeDeviceId, localState.isOn);
        }
        
        // Eğer kullanıcı manuel bir değişiklik yaptıysa otomasyonu iptal et
        if (state.activeSession && state.activeSession.status === 'RUNNING' && state.activeDeviceId) {
           updateAutomationRTDB(state.activeDeviceId, { status: 'CANCELLED' });
           set({ activeSession: null });
        }

        state.syncWithESP();
      },
      initFirebaseListener: () => {
        const initialState = get();
        if (!initialState.activeDeviceId) return;

        syncInitialSettings({
          monthlyBaseConsumption: initialState.monthlyBaseConsumption,
          dusukTarifeFiyat: initialState.dusukTarifeFiyat,
          yuksekTarifeFiyat: initialState.yuksekTarifeFiyat
        });

        if (unsubLastSeen) unsubLastSeen();
        unsubLastSeen = subscribeToLastSeenRTDB(initialState.activeDeviceId, (timestamp) => {
          set({ lastSeen: new Date(timestamp) });
        });

        if (unsubDevicePayload) unsubDevicePayload();
        unsubDevicePayload = subscribeToDevicePayload(initialState.activeDeviceId, (payload, stats) => {
          const currentState = get();
          if (currentState.isOn !== payload.power || currentState.targetTemp !== payload.temp || currentState.mode !== payload.mode || currentState.fanSpeed !== payload.fanSpeed || currentState.swing !== payload.swing || currentState.totalWorkingMinutes !== (stats?.totalWorkingMinutes || 0)) {
            set({
              isOn: payload.power,
              targetTemp: payload.temp,
              mode: payload.mode,
              fanSpeed: payload.fanSpeed,
              swing: payload.swing,
              deviceName: payload.deviceName,
              totalWorkingMinutes: stats?.totalWorkingMinutes || 0,
            });
          }
        });

        if (unsubRoomTemp) unsubRoomTemp();
        unsubRoomTemp = subscribeToRoomTempRTDB(initialState.activeDeviceId, (temp) => {
          set({ roomTemp: temp });
        });

        subscribeToSettings((data) => {
          set((state) => ({
            ...state,
            monthlyBaseConsumption: data?.monthlyBaseConsumption || state.monthlyBaseConsumption,
            dusukTarifeFiyat: data?.dusukTarifeFiyat !== undefined ? data.dusukTarifeFiyat : state.dusukTarifeFiyat,
            yuksekTarifeFiyat: data?.yuksekTarifeFiyat !== undefined ? data.yuksekTarifeFiyat : state.yuksekTarifeFiyat,
          }));
        });

        if (unsubAutomation) unsubAutomation();
        unsubAutomation = subscribeToAutomationRTDB(initialState.activeDeviceId, (data) => {
          if (!data || data.status !== 'RUNNING') {
            set({ activeSession: null });
            return;
          }
          let calculatedNodeStartedAt = data.startedAt;
          if (data.nodes) {
             const nodesArray = Array.isArray(data.nodes) ? data.nodes : Object.values(data.nodes);
             for (let i = 0; i < (data.currentNodeIndex || 0); i++) {
                if (nodesArray[i]) {
                   calculatedNodeStartedAt += (nodesArray[i].durationMinutes || 0) * 60000;
                }
             }
          }

          set({
            activeSession: {
              scenarioId: data.scenarioId,
              status: data.status,
              startedAt: data.startedAt,
              currentNodeIndex: data.currentNodeIndex || 0,
              nodeStartedAt: data.nodeStartedAt || calculatedNodeStartedAt,
              totalDurationMinutes: data.totalDurationMinutes || 0
            }
          });
        });
      },
      checkOnlineStatus: () => {
        const state = get();
        if (!state.lastSeen) return;
        const now = Date.now();
        const timeSinceLastSeen = now - new Date(state.lastSeen).getTime();
        const isOnline = timeSinceLastSeen < 45000;
        if (state.isOnline !== isOnline) {
          set({ isOnline });
        }
      },
      setTariffData: (matrix, dusuk, yuksek) => {
        set({
          monthlyBaseConsumption: matrix,
          dusukTarifeFiyat: dusuk,
          yuksekTarifeFiyat: yuksek
        });
        updateSettings({
          monthlyBaseConsumption: matrix,
          dusukTarifeFiyat: dusuk,
          yuksekTarifeFiyat: yuksek
        });
      },
      saveScenario: (scenario) => {
        set((state) => {
          const index = state.scenarios.findIndex(s => s.id === scenario.id);
          if (index >= 0) {
            const newScenarios = [...state.scenarios];
            newScenarios[index] = scenario;
            return { scenarios: newScenarios };
          }
          return { scenarios: [...state.scenarios, scenario] };
        });
      },
      deleteScenario: (id) => {
        set((state) => ({ scenarios: state.scenarios.filter(s => s.id !== id) }));
      },
      startAutomation: (scenarioId) => {
        const state = get();
        const scenario = state.scenarios.find(s => s.id === scenarioId);
        if (!scenario || scenario.nodes.length === 0 || !state.activeDeviceId) return;

        const totalDurationMinutes = scenario.nodes.reduce((acc, curr) => acc + curr.durationMinutes, 0);
        const now = Date.now();

        const payload = {
          status: 'RUNNING',
          scenarioId,
          startedAt: now,
          nodeStartedAt: now,
          currentNodeIndex: 0,
          totalDurationMinutes,
          totalNodes: scenario.nodes.length,
          nodes: scenario.nodes
        };

        // Firebase RTDB'ye yazarak ESP32'nin almasını sağla
        updateAutomationRTDB(state.activeDeviceId, payload);
      },
      stopAutomation: () => {
        const state = get();
        if (state.activeDeviceId) {
          updateAutomationRTDB(state.activeDeviceId, { status: 'COMPLETED' });
        }
        set({ activeSession: null });
      },
      setActiveDeviceId: (id) => {
        set({ activeDeviceId: id });
        if (id) {
          get().initFirebaseListener();
        }
      },
      addDevice: (device) => {
        set((state) => {
          const exists = state.devices.find(d => d.id === device.id);
          if (exists) return state;
          return { devices: [...state.devices, device] };
        });
      },
      updateDevice: (deviceId, updates) => {
        set((state) => ({
          devices: state.devices.map(d => d.id === deviceId ? { ...d, ...updates } : d)
        }));
      },
      removeDevice: (deviceId) => {
        set((state) => ({
          devices: state.devices.filter(d => d.id !== deviceId),
          activeDeviceId: state.activeDeviceId === deviceId ? (state.devices.find(d => d.id !== deviceId)?.id || null) : state.activeDeviceId
        }));
      }
    }),
    {
      name: 'ac-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
