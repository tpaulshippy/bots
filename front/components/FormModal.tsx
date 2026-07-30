import { Fragment } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";

export type FormField = {
  label?: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  height?: number;
};

export type FormModalProps = {
  title?: string;
  fields: FormField[];
  submitLabel: string;
  onSubmit: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  cancelDestructive?: boolean;
  style?: any;
};

export function FormModal({
  title,
  fields,
  submitLabel,
  onSubmit,
  cancelLabel = "Cancel",
  onCancel,
  cancelDestructive = false,
  style,
}: FormModalProps) {
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const tintColor = useThemeColor({}, "tint");
  const cardBackground = useThemeColor({}, "cardBackground");

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.formContainer, style]}>
            {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
            {fields.map((field) => (
              <Fragment key={field.placeholder}>
                {field.label ? (
                  <ThemedText style={styles.label}>{field.label}</ThemedText>
                ) : null}
                <TextInput
                  style={[
                    styles.input,
                    field.multiline && styles.multilineInput,
                    field.height ? { height: field.height } : null,
                    { borderColor, color: textColor },
                  ]}
                  placeholder={field.placeholder}
                  placeholderTextColor={iconColor}
                  value={field.value}
                  onChangeText={field.onChangeText}
                  multiline={field.multiline}
                />
              </Fragment>
            ))}
            <View style={styles.buttons}>
              <Pressable
                style={[
                  styles.cancelButton,
                  {
                    backgroundColor: cancelDestructive ? "#d33" : cardBackground,
                  },
                ]}
                onPress={onCancel}
              >
                <ThemedText
                  style={[
                    styles.cancelButtonText,
                    cancelDestructive && styles.destructiveButtonText,
                  ]}
                >
                  {cancelLabel}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: tintColor }]}
                onPress={onSubmit}
              >
                <ThemedText style={styles.saveButtonText}>{submitLabel}</ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  multilineInput: {
    textAlignVertical: "top",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    marginRight: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  destructiveButtonText: {
    color: "white",
  },
  saveButton: {
    flex: 1,
    padding: 12,
    marginLeft: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});
