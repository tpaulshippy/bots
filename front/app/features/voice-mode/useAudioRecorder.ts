import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

type AudioRecorderHook = {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Uint8Array | null>;
  error: string | null;
  clearError: () => void;
};

export function useAudioRecorder(
  onDataAvailable?: (data: Uint8Array) => void,
  sampleRate: number = 16000,
  channels: number = 1
): AudioRecorderHook {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recording = useRef<Audio.Recording | null>(null);
  const audioChunks = useRef<Uint8Array[]>([]);
  const dataSubscription = useRef<any>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Request permissions
      const permission = await Audio.requestPermissionsAsync();
      
      if (!permission.granted) {
        throw new Error('Microphone permission not granted');
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recording.current = newRecording;
      audioChunks.current = [];
      setIsRecording(true);
      setError(null);

      // Set up audio data handler if onDataAvailable is provided
      if (onDataAvailable && newRecording._recorder) {
        // @ts-ignore - Expo Audio private API
        dataSubscription.current = newRecording._recorder._eventEmitter.addListener(
          'data',
          (data: ArrayBuffer) => {
            const chunk = new Uint8Array(data);
            audioChunks.current.push(chunk);
            onDataAvailable(chunk);
          }
        );
      }

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setIsRecording(false);
      throw err;
    }
  }, [onDataAvailable]);

  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    try {
      if (!recording.current) {
        return null;
      }

      setIsRecording(false);

      // Stop the recording
      await recording.current.stopAndUnloadAsync();
      recording.current = null;

      // Clean up data subscription
      if (dataSubscription.current) {
        dataSubscription.current.remove();
        dataSubscription.current = null;
      }

      // Combine all audio chunks
      if (audioChunks.current.length > 0) {
        const totalLength = audioChunks.current.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of audioChunks.current) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        
        audioChunks.current = [];
        return result;
      }

      return null;
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      throw err;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recording.current) {
        recording.current.stopAndUnloadAsync().catch(console.error);
      }
      
      if (dataSubscription.current) {
        dataSubscription.current.remove();
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
    clearError,
  };
}

type AudioPlayerHook = {
  isPlaying: boolean;
  play: (uri: string) => Promise<void>;
  stop: () => void;
  error: string | null;
  clearError: () => void;
};

export function useAudioPlayer(): AudioPlayerHook {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useRef<Audio.Sound | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const play = useCallback(async (uri: string) => {
    try {
      // Stop any currently playing sound
      if (sound.current) {
        await sound.current.unloadAsync();
        sound.current = null;
      }

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Load and play the sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      sound.current = newSound;
      setIsPlaying(true);
      setError(null);

      // Set up playback status updates
      await newSound.setStatusAsync({ shouldPlay: true });
      
      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          newSound.unloadAsync().catch(console.error);
          sound.current = null;
        }
      });

    } catch (err) {
      console.error('Error playing audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to play audio');
      setIsPlaying(false);
      throw err;
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      if (sound.current) {
        await sound.current.stopAsync();
        await sound.current.unloadAsync();
        sound.current = null;
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Error stopping audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop audio');
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sound.current) {
        sound.current.unloadAsync().catch(console.error);
      }
    };
  }, []);

  return {
    isPlaying,
    play,
    stop,
    error,
    clearError,
  };
}
