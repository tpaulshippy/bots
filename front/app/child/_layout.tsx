import { Stack } from "expo-router";
import { Button } from "react-native";

export default function ChildLayout() {
  return (
    <Stack
      screenOptions={({
        route,
      }: {
        route: { params?: { title?: string } };
      }) => ({ 
        title: route.params?.title || ""
      })}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: "Chats",
        }}
      />
      <Stack.Screen
        name="chat"
        options={{
          headerShown: true,
          headerTintColor: "#BBB",
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
