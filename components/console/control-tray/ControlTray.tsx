/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';

import { memo, ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useUI } from '@/lib/state';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const audioRecorderStarted = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout>();

  const { useGrounding, setUseGrounding } = useUI();
  const { client, connected, connect, disconnect, volume } = useLiveAPIContext();

  console.log('ControlTray render:', { connected, isConnecting, muted, clientStatus: client.status });

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  // Memoized onData callback to prevent unnecessary re-creations
  const onData = useCallback((base64: string) => {
    // Check WebSocket state before sending to prevent errors
    if (client.status !== 'connected' || !connected) {
      console.warn('Skipping audio data - client not connected:', { 
        clientStatus: client.status, 
        connected 
      });
      return;
    }
    
    // Additional check for session state if available
    if (!client.session || client.session.readyState !== WebSocket.OPEN) {
      console.warn('Skipping audio data - WebSocket not open');
      return;
    }
    
    try {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    } catch (error) {
      // Only log WebSocket state errors, don't crash the app
      if (error.message?.includes('CLOSING') || error.message?.includes('CLOSED')) {
        console.warn('WebSocket closing, stopping audio transmission');
      } else {
        console.error('Error sending audio data:', error);
      }
    }
  }, [client, connected]);

  useEffect(() => {
    console.log('Audio recorder effect:', { 
      connected, 
      muted, 
      audioRecorderStarted: audioRecorderStarted.current,
      clientStatus: client.status 
    });

    // Clean up previous listeners to prevent duplicates
    audioRecorder.off('data', onData);
    
    if (connected && client.status === 'connected' && !muted) {
      console.log('Setting up audio recorder...');
      audioRecorder.on('data', onData);
      
      if (!audioRecorderStarted.current) {
        console.log('Starting audio recorder...');
        audioRecorder
          .start()
          .then(() => {
            console.log('Audio recorder started successfully');
            audioRecorderStarted.current = true;
          })
          .catch(error => {
            console.error('Error starting audio recorder:', error);
            audioRecorderStarted.current = false;
            // Show user-friendly error without disconnecting
            if (error.message?.includes('Permission denied') || error.message?.includes('getUserMedia')) {
              console.log('Microphone permission denied - user needs to allow microphone access');
            }
          });
      }
    } else {
      console.log('Stopping audio recorder...');
      if (audioRecorderStarted.current) {
        audioRecorder.stop();
        audioRecorderStarted.current = false;
      }
    }

    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client.status, muted, audioRecorder, onData]);

  // Reset audio recorder state when disconnected
  useEffect(() => {
    if (!connected) {
      audioRecorderStarted.current = false;
    }
  }, [connected]);

  // Auto-disconnect if connecting takes too long
  useEffect(() => {
    if (isConnecting) {
      connectionTimeoutRef.current = setTimeout(() => {
        console.error('Connection timeout - resetting isConnecting state');
        setIsConnecting(false);
      }, 15000); // 15 second timeout

      return () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      };
    }
  }, [isConnecting]);

  const handleConnect = async () => {
    console.log('Connect button clicked:', { connected, isConnecting, clientStatus: client.status });
    
    if (connected || isConnecting || client.status === 'connected') {
      console.log('Already connected or connecting, ignoring');
      return;
    }
    
    console.log('Starting connection process...');
    setIsConnecting(true);
    
    try {
      await connect();
      console.log('Connection successful');
    } catch (error) {
      console.error('Connection failed:', error);
      // Only emit error if it's a real connection failure
      client.emit(
        'error',
        new ErrorEvent('error', {
          error: error as Error,
          message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      );
    } finally {
      console.log('Connection process finished, resetting isConnecting');
      setIsConnecting(false);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    }
  };

  const handleDisconnect = async () => {
    console.log('Disconnect button clicked:', { connected, isConnecting, clientStatus: client.status });
    
    if (!connected || isConnecting || client.status !== 'connected') {
      console.log('Not connected or already processing, ignoring');
      return;
    }
    
    console.log('Starting disconnect process...');
    setIsConnecting(true);
    
    try {
      await disconnect();
      console.log('Disconnect successful');
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      console.log('Disconnect process finished, resetting isConnecting');
      setIsConnecting(false);
    }
  };

  const buttonDisabled = isConnecting;
  console.log('Button state:', { connected, isConnecting, disabled: buttonDisabled, clientStatus: client.status });

  // Update mic button style based on volume
  const micButtonStyle = connected && !muted ? {
    '--volume': `${Math.min(volume * 100, 50)}px`
  } as React.CSSProperties : {};

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav', { disabled: !connected })}>
        <button
          className={cn('action-button mic-button', { disabled: !connected })}
          style={micButtonStyle}
          onClick={() => setMuted(!muted)}
          disabled={!connected}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>
        <button
          className={cn('action-button grounding-button', {
            active: useGrounding,
          })}
          onClick={() => setUseGrounding(!useGrounding)}
          title={
            useGrounding
              ? 'Disable Google Search Grounding'
              : 'Enable Google Search Grounding'
          }
        >
          <span className="material-symbols-outlined filled">search</span>
        </button>
        {children}
      </nav>

      <div className={cn('connection-container', { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected })}
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={buttonDisabled}
          >
            <span className="material-symbols-outlined filled">
              {isConnecting ? 'sync' : connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">
          {isConnecting ? 'Connecting...' : connected ? 'Streaming' : 'Ready'}
        </span>
      </div>
    </section>
  );
}

export default memo(ControlTray);