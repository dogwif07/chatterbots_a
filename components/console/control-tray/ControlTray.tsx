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

import { memo, ReactNode, useEffect, useRef, useState } from 'react';
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
  const micPermissionDenied = useRef(false);

  const { useGrounding, setUseGrounding } = useUI();
  const { client, connected, connect, disconnect } = useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      if (client.status !== 'connected') return;
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    
    // Only start recording if connected and not muted and not previously denied
    if (connected && !muted && !micPermissionDenied.current) {
      audioRecorder
        .on('data', onData)
        .start()
        .catch(error => {
          console.error('Error starting audio recorder:', error);
          micPermissionDenied.current = true;
          client.emit(
            'error',
            new ErrorEvent('error', {
              error,
              message: 'Could not start microphone. Please check permissions.',
            })
          );
          // Don't disconnect here - let user manually disconnect if needed
        });
    } else {
      audioRecorder.stop();
    }
    
    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client, muted, audioRecorder]);

  const handleConnect = async () => {
    if (connected || isConnecting) return;
    
    setIsConnecting(true);
    micPermissionDenied.current = false;
    
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect:', error);
      client.emit(
        'error',
        new ErrorEvent('error', {
          error: error as Error,
          message:
            'Connection failed. Please check your API key and network status.',
        })
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connected || isConnecting) return;
    
    setIsConnecting(true);
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav', { disabled: !connected })}>
        <button
          className={cn('action-button mic-button', { disabled: !connected })}
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
            disabled={isConnecting}
          >
            <span className="material-symbols-outlined filled">
              {isConnecting ? 'sync' : connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">
          {isConnecting ? 'Connecting...' : 'Streaming'}
        </span>
      </div>
    </section>
  );
}

export default memo(ControlTray);