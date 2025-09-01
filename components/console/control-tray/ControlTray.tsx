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
  
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const audioRecorderStarted = useRef(false);

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

  // Set config when it changes
  useEffect(() => {
    setConfig(liveConfig);
  }, [liveConfig, setConfig]);

  // Focus connect button when not connected
  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  // Audio data handler
  const onData = useCallback((base64: string) => {
    if (!connected || client.status !== 'connected') {
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
      console.error('Error sending audio data:', error);
    }
  }, [client, connected]);

  // Manage audio recorder lifecycle
  useEffect(() => {
    audioRecorder.off('data', onData);
    
    if (connected && !muted) {
      audioRecorder.on('data', onData);
      
      if (!audioRecorderStarted.current) {
        audioRecorder
          .start()
          .then(() => {
            audioRecorderStarted.current = true;
          })
          .catch(error => {
            console.error('Error starting audio recorder:', error);
          });
      }
    } else {
      if (audioRecorderStarted.current) {
        audioRecorder.stop();
        audioRecorderStarted.current = false;
      }
    }

    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, muted, audioRecorder, onData]);

  // Reset audio recorder state when disconnected
  useEffect(() => {
    if (!connected) {
      audioRecorderStarted.current = false;
    }
  }, [connected]);

  const handleConnect = async () => {
    if (connected || isConnecting) {
      return;
    }
    
    setIsConnecting(true);
    
    try {
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connected || isConnecting) {
      return;
    }
    
    setIsConnecting(true);
    
    try {
      await disconnect();
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const buttonDisabled = isConnecting;

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
                : 'Connect'
            }
          >
            <span className="material-symbols-outlined filled">
              {isConnecting ? 'sync' : connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
          {!connected && (
            <button
              className={cn('grounding-toggle', { active: useGrounding })}
              onClick={() => setUseGrounding(!useGrounding)}
              title={
                useGrounding
                  ? 'Disable Google Search Grounding'
                  : 'Enable Google Search Grounding'
              }
            >
              <span className="material-symbols-outlined filled">search</span>
            </button>
          )}
        </div>
        <span className="text-indicator">
          {isConnecting 
            ? 'Connecting...' 
            : connected 
            ? 'Streaming' 
            : 'Ready'
          }
        </span>
      </div>
    </section>
  );
}

export default memo(ControlTray);