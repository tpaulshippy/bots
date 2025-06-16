import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useAudioPlayer } from './useAudioRecorder';

type VoiceMessageProps = {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  audioUrl?: string;
  isFinal?: boolean;
  timestamp: Date;
  isPlaying?: boolean;
  onPlay?: (id: string) => void;
};

export function VoiceMessage({
  id,
  text,
  role,
  audioUrl,
  isFinal = true,
  timestamp,
  isPlaying = false,
  onPlay,
}: VoiceMessageProps) {
  const { play, stop } = useAudioPlayer();
  
  const handlePlay = async () => {
    if (audioUrl) {
      if (onPlay) {
        onPlay(id);
      }
      try {
        await play(audioUrl);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View 
      style={[
        styles.container,
        role === 'assistant' ? styles.assistantContainer : styles.userContainer,
      ]}
    >
      <View 
        style={[
          styles.bubble,
          role === 'assistant' ? styles.assistantBubble : styles.userBubble,
        ]}
      >
        <ThemedText style={[
          styles.text,
          role === 'assistant' ? styles.assistantText : styles.userText,
        ]}>
          {text}
        </ThemedText>
        
        {!isFinal && (
          <View style={styles.typingIndicator}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        )}
        
        <View style={styles.footer}>
          <ThemedText style={[
            styles.time,
            role === 'assistant' ? styles.assistantTime : styles.userTime,
          ]}>
            {formatTime(timestamp)}
          </ThemedText>
          
          {audioUrl && (
            <TouchableOpacity 
              onPress={handlePlay}
              style={[
                styles.playButton,
                isPlaying && styles.playingButton,
              ]}
              disabled={isPlaying}
            >
              <ThemedText style={styles.playButtonText}>
                {isPlaying ? '▶️ Playing...' : '▶️ Play'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    padding: 12,
    paddingBottom: 8,
  },
  assistantBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  assistantText: {
    color: '#000',
  },
  userText: {
    color: '#FFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  time: {
    fontSize: 11,
    opacity: 0.7,
  },
  assistantTime: {
    color: '#666',
  },
  userTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  playButton: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  playingButton: {
    opacity: 0.7,
  },
  playButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  typingIndicator: {
    flexDirection: 'row',
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#999',
    marginRight: 4,
  },
  dot2: {
    opacity: 0.7,
    transform: [{ translateY: -2 }],
  },
  dot3: {
    opacity: 0.4,
    transform: [{ translateY: 2 }],
  },
});
