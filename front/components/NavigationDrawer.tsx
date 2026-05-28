import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  Platform,
  Pressable,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon: string;
  path: string;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const textColor = useThemeColor({}, "text");
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");

  const drawerWidth = 250;

  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -drawerWidth,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOpen, slideAnim, drawerWidth]);

  const menuItems: MenuItem[] = [
    { label: "Chats", icon: "bubble.left.fill", path: "/chatHistory" },
    { label: "Flashcards", icon: "square.grid.2x2.fill", path: "/flashcards" },
    { label: "Settings", icon: "gear", path: "/parent/settings" },
  ];

  const handleMenuPress = (path: string) => {
    router.push(path);
    onClose();
  };

  const isItemActive = (path: string) => {
    if (path === "/chatHistory" && pathname === "/chatHistory") return true;
    if (path !== "/" && path !== "/chatHistory" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      {isOpen && (
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
      )}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX: slideAnim }],
            backgroundColor,
          },
        ]}
      >
        <ThemedView style={styles.drawerContent}>
          <View style={styles.drawerHeader}>
            <ThemedText style={styles.drawerTitle}>Menu</ThemedText>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
            >
              <IconSymbol
                name="xmark"
                color={textColor}
                size={28}
              />
            </Pressable>
          </View>

          <View style={styles.menuItemsContainer}>
            {menuItems.map((item) => {
              const isActive = isItemActive(item.path);
              return (
                <Pressable
                  key={item.path}
                  onPress={() => handleMenuPress(item.path)}
                  style={[
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                  ]}
                >
                  <IconSymbol
                    name={item.icon}
                    color={isActive ? tintColor : textColor}
                    size={24}
                    style={styles.menuItemIcon}
                  />
                  <ThemedText
                    style={[
                      styles.menuItemText,
                      isActive && styles.menuItemTextActive,
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </ThemedView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  drawerContent: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 20 : 10,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    padding: 8,
  },
  menuItemsContainer: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 4,
  },
  menuItemActive: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
    paddingLeftHorizontal: 12,
  },
  menuItemIcon: {
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  menuItemTextActive: {
    fontWeight: "600",
    color: "#007AFF",
  },
});
