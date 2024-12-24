import { Stack } from "expo-router";

export default function ParentLayout() {
  return (
    <Stack
      screenOptions={({
        route,
      }: {
        route: { params?: { title?: string } };
      }) => ({ title: route.params?.title || "" })}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          title: "Chats",
        }}
      />
      <Stack.Screen
        name="screens/chat"
        options={{
          headerShown: true,
          headerTintColor: "#BBB",
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
