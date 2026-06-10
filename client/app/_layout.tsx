import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAppStore, startSyncPolling } from "../src/store/useAppStore";

export default function RootLayout() {
  const init = useAppStore((s) => s.init);
  const deviceId = useAppStore((s) => s.deviceId);
  const router = useRouter();

  useEffect(() => {
    if (deviceId) {
      init(deviceId);
      startSyncPolling();
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) {
      // Defer slightly to ensure layout / navigation state is ready
      const timer = setTimeout(() => {
        router.replace("/device-select");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [deviceId]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f0f1a" },
          headerTintColor: "#e2e8f0",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0f0f1a" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="device-select" options={{ title: "Select Device", headerShown: false }} />
      </Stack>
    </>
  );
}
