import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useVoiceWebSocket, WebSocketMessageHandler } from './useVoiceWebSocket';
import { useAudioRecorder, AudioDataHandler } from './useAudioRecorder';
import { VoiceMessage } from './VoiceMessage';

interface VoiceMessageType {
  id: string;
  text: string;
  isFinal: boolean;
  role: 'user' | 'assistant';
  audioUrl?: string;
  timestamp: Date;
}

type VoiceModeMessage = Omit<VoiceMessageType, 'id' | 'timestamp'> & {
  message_id: string;
  is_final?: boolean;
  audio_url?: string;
};

interface VoiceModeProps {
  chatId: string;
  onClose: () => void;
}

type Message = {
  id: string;
  text: string;
  isFinal: boolean;
  role: 'user' | 'assistant';
  audioUrl?: string;
  timestamp: Date;
};

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export default function VoiceMode({ chatId, onClose }: VoiceModeProps) {
  const [messages, setMessages] = useState<VoiceMessageType[]>([]);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);

  // Initialize WebSocket connection
  const { isConnected, error: wsError, sendMessage } = useVoiceWebSocket({
    chatId,
    onMessage: useCallback((message: any) => {
      handleWebSocketMessage(message);
    }, []),
    onError: useCallback((error: string) => {
      console.error('WebSocket error:', error);
    }, []),
  });

  // Initialize audio recorder
  const handleAudioData = useCallback((data: Uint8Array) => {
    if (!isConnected || !sendMessage) return;
    
    // Convert audio data to base64 for WebSocket transmission
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(data)));
    sendMessage({
      type: 'audio_chunk',
      data: base64Data,
    });
  }, [isConnected, sendMessage]);

  const {
    isRecording,
    startRecording,
    stopRecording,
    error: audioError,
  } = useAudioRecorder(handleAudioData);

  // Handle WebSocket messages
  function handleWebSocketMessage(message: any) {
    console.log('Received message:', message);
    
    switch (message.type) {
      case 'transcription_update':
        handleTranscriptionUpdate(message);
        break;
        
      case 'recording_started':
        setCurrentMessageId(message.message_id);
        break;
        
      case 'recording_stopped':
        setCurrentMessageId(null);
        break;
        
      case 'tts_response':
        handleTTSResponse(message);
        break;
        
      case 'error':
        console.error('Server error:', message.message);
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  // Handle incoming audio data from the recorder is now part of useAudioRecorder initialization

  // Toggle recording state
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
      
      // Notify server that recording has stopped
      if (sendMessage) {
        sendMessage({ type: 'stop_recording' });
      }
    } else {
      // Start a new recording session
      if (sendMessage) {
        sendMessage({
          type: 'start_recording',
          sample_rate: 16000,
          channels: 1,
        });
      }
      
      await startRecording();
    }
  };

  // Handle transcription updates from the server
  const handleTranscriptionUpdate = useCallback((message: VoiceModeMessage) => {
    setMessages(prevMessages => {
      const existingIndex = prevMessages.findIndex(m => m.id === message.message_id);
      
      if (existingIndex >= 0) {
        // Update existing message
        const updatedMessages = [...prevMessages];
        updatedMessages[existingIndex] = {
          ...updatedMessages[existingIndex],
          text: message.text,
          isFinal: message.is_final ?? message.isFinal,
        };
        return updatedMessages;
      } else {
        // Add new message
        return [
          ...prevMessages,
          {
            id: message.message_id,
            text: message.text,
            isFinal: message.is_final ?? message.isFinal ?? false,
            role: 'user',
            timestamp: new Date(),
          },
        ];
      }
    });
  }, []);

  // Handle text-to-speech responses
  const handleTTSResponse = useCallback((message: { audio_url?: string; text: string }) => {
    if (!message.audio_url) return;
    
    setMessages(prevMessages => [
      ...prevMessages,
      {
        id: `tts-${Date.now()}`,
        text: message.text,
        isFinal: true,
        role: 'assistant',
        audioUrl: message.audio_url,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Handle playing audio
  const handlePlayAudio = useCallback(async (id: string) => {
    if (isPlayingId) return; // Prevent multiple plays
    
    const message = messages.find(m => m.id === id);
    if (!message?.audioUrl) return;
    
    try {
      setIsPlayingId(id);
      
      // In a real app, you would use expo-av to play the audio
      // For now, we'll just log it
      console.log('Playing audio:', message.audioUrl);
      
      // Simulate audio playback
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('Error playing audio:', error);
    } finally {
      setIsPlayingId(null);
    }
  }, [isPlayingId, messages]);

  // Combine all errors
  const error = wsError || audioError;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Voice Mode</ThemedText>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <ThemedText>Close</ThemedText>
        </TouchableOpacity>
      </View>
      
      {error && (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}
      
      <ScrollView 
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map((message, index) => (
          <VoiceMessage
            key={`${message.id}-${index}`}
            id={message.id}
            text={message.text}
            role={message.role}
            audioUrl={message.audioUrl}
            isFinal={message.isFinal}
            timestamp={message.timestamp}
            isPlaying={isPlayingId === message.id}
            onPlay={handlePlayAudio}
          />
        ))}
      </ScrollView>
      
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          onPress={toggleRecording}
          style={[
            styles.recordButton,
            isRecording && styles.recordingButton,
            isProcessing && styles.processingButton,
          ]}
          disabled={!isConnected || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.recordButtonText}>
              {isRecording ? 'Stop' : 'Start Speaking'}
            </ThemedText>
          )}
        </TouchableOpacity>
        
        {!isConnected && (
          <View style={styles.connectionStatus}>
            <View style={styles.connectionDot} />
            <ThemedText style={styles.connectionText}>Connecting...</ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
  },
  messagesContainer: {
    flex: 1,
    marginBottom: 16,
  },
  messagesContent: {
    paddingBottom: 16,
  },
  controlsContainer: {
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#2196f3',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    marginBottom: 8,
  },
  recordingButton: {
    backgroundColor: '#f44336',
  },
  processingButton: {
    backgroundColor: '#9e9e9e',
  },
  recordButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff9800',
    marginRight: 4,
  },
  connectionText: {
    color: '#ff9800',
    fontSize: 12,
  },
});

// ... (rest of the code remains the same)
