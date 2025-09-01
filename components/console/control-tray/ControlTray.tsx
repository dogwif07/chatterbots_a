import cn from 'classnames';
import { memo, ReactNode, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useUI, useAgent, useUser } from '@/lib/state';
import { createSystemInstructions } from '@/lib/prompts';
import { LiveConnectConfig, Modality } from '@google/genai';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const audioRecorderStarted = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout>();
  const configSetRef = useRef(false);

  const { useGrounding, setUseGrounding } = useUI();
  const { client, connected, connect, disconnect, volume, setConfig } = useLiveAPIContext();
  const user = useUser();
  const { current: agent } = useAgent();

  // Create stable config with memoization
  const liveConfig = useMemo((): LiveConnectConfig => {
    const config: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: agent.voice },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: createSystemInstructions(agent, user),
          },
        ],
      },
    };

    if (useGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    return config;
  }, [agent.voice, agent.name, agent.personality, user.name, user.info, useGrounding]);

  // Set config only once when it changes
  useEffect(() => {
    if (!configSetRef.current) {
      console.log('Setting initial config:', liveConfig);
      setConfig(liveConfig);
      setConfigReady(true);
      configSetRef.current = true;
    }
  }, [liveConfig, setConfig]);

  // Focus connect button when not connected
  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  // Audio data handler with proper connection checking
  const onData = useCallback((base64: string) => {
    // Comprehensive connection state checking
    if (!connected || client.status !== 'connected') {
      return; // Silently skip if not connected
    }
    
    // Check WebSocket state if available
    if (client.session?.readyState !== WebSocket.OPEN) {
      return; // Silently skip if WebSocket not open
    }
    
    try {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    } catch (error) {
      // Only log significant errors, ignore WebSocket state errors
      if (error instanceof Error && !error.message.includes('CLOSING') && !error.message.includes('CLOSED')) {
        console.error('Error sending audio data:', error);
      }
    }
  }, [client, connected]);

  // Manage audio recorder lifecycle
  useEffect(() => {
    // Clean up previous listeners
    audioRecorder.off('data', onData);
    
    if (connected && client.status === 'connected' && !muted && configReady) {
      audioRecorder.on('data', onData);
      
      if (!audioRecorderStarted.current) {
        audioRecorder
          .start()
          .then(() => {
            console.log('Audio recorder started');
            audioRecorderStarted.current = true;
          })
          .catch(error => {
            console.error('Error starting audio recorder:', error);
            audioRecorderStarted.current = false;
            // Don't disconnect on microphone errors - let user handle it
          });
      }
    } else {
      if (audioRecorderStarted.current) {
        audioRecorder.stop();
        audioRecorderStarted.current = false;
        console.log('Audio recorder stopped');
      }
    }

    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client.status, muted, configReady, audioRecorder, onData]);

  // Reset audio recorder state when disconnected
  useEffect(() => {
    if (!connected) {
      audioRecorderStarted.current = false;
    }
  }, [connected]);

  // Connection timeout protection
  useEffect(() => {
    if (isConnecting) {
      connectionTimeoutRef.current = setTimeout(() => {
        console.error('Connection timeout');
        setIsConnecting(false);
      }, 15000);

      return () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      };
    }
  }, [isConnecting]);

  const handleConnect = async () => {
    if (connected || isConnecting || client.status === 'connected') {
      console.log('Already connected or connecting');
      return;
    }
    
    if (!configReady) {
      console.log('Config not ready yet');
      return;
    }
    
    console.log('Starting connection...');
    setIsConnecting(true);
    
    try {
      await connect();
      console.log('Connection successful');
    } catch (error) {
      console.error('Connection failed:', error);
      client.emit(
        'error',
        new ErrorEvent('error', {
          error: error as Error,
          message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      );
    } finally {
      setIsConnecting(false);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    }
  };

  const handleDisconnect = async () => {
    if (!connected || isConnecting || client.status !== 'connected') {
      console.log('Not connected or processing');
      return;
    }
    
    console.log('Starting disconnect...');
    setIsConnecting(true);
    
    try {
      await disconnect();
      console.log('Disconnect successful');
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const buttonDisabled = isConnecting || !configReady;

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
          title={muted ? 'Unmute microphone' : 'Mute microphone'}
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
          onClick={() => {
            setUseGrounding(!useGrounding);
            configSetRef.current = false; // Reset config on grounding change
          }}
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
            title={
              isConnecting 
                ? 'Connecting...' 
                : connected 
                ? 'Disconnect' 
                : configReady 
                ? 'Connect' 
                : 'Preparing...'
            }
          >
            <span className="material-symbols-outlined filled">
              {isConnecting ? 'sync' : connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">
          {isConnecting 
            ? 'Connecting...' 
            : connected 
            ? 'Streaming' 
            : configReady 
            ? 'Ready' 
            : 'Preparing...'
          }
        </span>
      </div>
    </section>
  );
}

export default memo(ControlTray);