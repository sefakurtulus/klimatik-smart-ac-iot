import React, { useEffect } from 'react';
import 'react-native-gesture-handler';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Colors, Radius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAcStore } from '@/store/useAcStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DeviceSelectionScreen from '@/components/DeviceSelection';
import * as SplashScreen from 'expo-splash-screen';

// Splash ekranını otomatik kapanmasını engelle
SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const store = useAcStore();
  const theme = Colors[store.isDarkMode ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // 2.5 saniye sonra splash ekranını gizle
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 2500);

    // Online durumu periyodik olarak kontrol et
    const interval = setInterval(() => {
      store.checkOnlineStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
      {!store.activeDeviceId ? (
        <DeviceSelectionScreen />
      ) : (
      <Tabs
        screenOptions={{
          sceneStyle: { backgroundColor: theme.background },
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: insets.bottom > 0 ? insets.bottom + 10 : 20,
            left: 20,
            right: 20,
            height: 70,
            backgroundColor: theme.backgroundElement,
            borderRadius: Radius.full,
            borderWidth: 1,
            borderColor: theme.border,
            ...Shadows.floating,
            paddingBottom: 0,
            paddingTop: 0,
            justifyContent: 'center',
            alignItems: 'center',
          },
          tabBarItemStyle: {
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 0,
            paddingBottom: 0,
          },
          tabBarShowLabel: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Ana Sayfa',
            tabBarIcon: ({ color, size }) => (
              <View style={{ transform: [{ translateY: 13 }] }}>
                <Ionicons color={color} name="home" size={size} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="scenarios"
          options={{
            title: 'Senaryolar',
            tabBarIcon: ({ color, size }) => (
              <View style={{ transform: [{ translateY: 13 }] }}>
                <Ionicons color={color} name="color-wand" size={size} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'İstatistik',
            tabBarIcon: ({ color, size }) => (
              <View style={{ transform: [{ translateY: 13 }] }}>
                <Ionicons color={color} name="stats-chart" size={size} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Ayarlar',
            tabBarIcon: ({ color, size }) => (
              <View style={{ transform: [{ translateY: 13 }] }}>
                <Ionicons color={color} name="settings" size={size} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, size }) => (
              <View style={{ transform: [{ translateY: 13 }] }}>
                <Ionicons color={color} name="person" size={size} />
              </View>
            ),
          }}
        />
        {/* Hide the default explore screen if it exists */}
        <Tabs.Screen
          name="explore"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="automation-builder"
          options={{
            href: null,
          }}
        />
      </Tabs>
      )}
      </View>
    </GestureHandlerRootView>
  );
}
