import PinWrapper from "@/components/PinWrapper";
import { Stack } from "expo-router";

export default function ParentLayout() {
  return (
    <PinWrapper>
      <Stack
        screenOptions={({
          route,
        }: {
          route: { params?: { title?: string } };
        }) => ({ title: route.params?.title || "" })}
      >
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            title: "Settings",
          }}
        />       
      </Stack>
    </PinWrapper>
  );
}
