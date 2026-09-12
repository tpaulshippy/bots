import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

const recordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4" as const,
    audioEncoder: "aac" as const,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".wav",
    sampleRate: 16000,
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

interface VoiceInputProps {
  onSend: (audioUri: string) => Promise<void> | void;
  disabled?: boolean;
}

export default function VoiceInput({ onSend, disabled }: VoiceInputProps) {
  const recorder = useAudioRecorder(recordingOptions);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((seconds) => seconds + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    if (disabled || busy || recording) {
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    cancelledRef.current = false;
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    startTimer();
  }, [busy, disabled, recorder, recording]);

  const finishRecording = useCallback(async () => {
    stopTimer();
    setRecording(false);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } finally {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    }
    if (cancelledRef.current || !uri) {
      return;
    }
    setBusy(true);
    try {
      await onSend(uri);
    } finally {
      setBusy(false);
    }
  }, [onSend, recorder]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const formatTime = (totalSeconds: number) =>
    `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

  if (Platform.OS === "web") {
    return null;
  }

  if (recording) {
    return (
      <ThemedView style={styles.row}>
        <ThemedButton
          testID="voice-cancel"
          onPress={cancelRecording}
          lightColor="#d9534f"
          darkColor="#d9534f"
          style={styles.cancel}
        >
          <IconSymbol name="xmark" color="#fff" size={20} />
        </ThemedButton>
        <ThemedView style={styles.statusPill}>
          <ThemedText style={styles.statusText}>
            ● recording {formatTime(elapsed)} · release to send
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <Pressable
      testID="voice-hold"
      onPressIn={startRecording}
      onPressOut={finishRecording}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.holdButton,
        pressed && styles.holdButtonPressed,
      ]}
    >
      <IconSymbol
        name={busy ? "hourglass" : "mic.fill"}
        color="#fff"
        size={24}
      />
      <ThemedText style={[styles.holdLabel]}>
        {busy ? "Sending…" : "Hold to talk"}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  statusPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  statusText: {
    fontSize: 14,
  },
  cancel: {
    height: 44,
    width: 44,
    marginRight: 8,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  holdButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0a7ea4",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  holdButtonPressed: {
    opacity: 0.7,
  },
  holdLabel: {
    color: "#fff",
    fontWeight: "600",
  },
});
