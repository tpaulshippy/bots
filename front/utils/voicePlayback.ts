import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

let currentPlayer: AudioPlayer | null = null;

export const stopPlayback = async (): Promise<void> => {
  const player = currentPlayer;
  currentPlayer = null;
  if (player) {
    player.pause();
    player.release();
  }
};

export const playBase64Wav = async (audioBase64: string): Promise<void> => {
  await stopPlayback();
  const uri = `${FileSystem.cacheDirectory}voice-reply.wav`;
  await FileSystem.writeAsStringAsync(uri, audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });
  currentPlayer = createAudioPlayer(uri);
  currentPlayer.play();
};
