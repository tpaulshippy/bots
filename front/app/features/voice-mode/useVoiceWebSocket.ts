import { useCallback, useEffect, useRef, useState } from 'react';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type MessageHandler = (message: WebSocketMessage) => void;

export function useVoiceWebSocket(chatId: string, onMessage: MessageHandler) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      if (ws.current) {
        ws.current.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.EXPO_PUBLIC_API_URL?.replace(/^https?:/, '') || 'localhost:8000';
      const wsUrl = `${protocol}//${host}/ws/voice/${chatId}/`;
      
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        
        // Clear any pending reconnect timeouts
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };
      
      socket.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          onMessage(data);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      socket.onclose = (event) => {
        console.log('WebSocket Disconnected', event);
        setIsConnected(false);
        
        // Only attempt to reconnect if this wasn't an intentional closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setError('Unable to connect to voice service. Please try again later.');
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        setError('Connection error. Attempting to reconnect...');
      };
      
      ws.current = socket;
      
    } catch (err) {
      console.error('Failed to connect to WebSocket:', err);
      setError('Failed to connect to voice service');
    }
  }, [chatId, onMessage]);

  const sendMessage = useCallback((message: Record<string, any>) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Error sending WebSocket message:', err);
        setError('Failed to send message');
        return false;
      }
    } else {
      console.warn('WebSocket not connected, cannot send message');
      setError('Not connected to voice service');
      return false;
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      // Clean up WebSocket connection
      if (ws.current) {
        ws.current.close();
      }
      
      // Clear any pending reconnect timeouts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    error,
    sendMessage,
    reconnect: connect
  };
}
