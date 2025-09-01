import cn from 'classnames';
import { memo, ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useUI, useAgent, useUser } from '@/lib/state';
import { createSystemInstructions } from '@/lib/prompts';
import { Modality } from '@google/genai';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const audioRecorderRef = useRef<{ started: boolean }>({ started: false });

  const { useGrounding, setUseGrounding } = useUI();
  const { client, connected, connect, disconnect, volume } = useLiveAPIContext();
  const user = useUser();
  const { current: agent } = useAgent();

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

  // Start audio recorder when connected and not muted
  useEffect(() => {
    if (connected && !muted && !audioRecorderRef.current.started) {
      audioRecorder.on('data', onData);
      audioRecorder
        .start()
        .then(() => {
          audioRecorderRef.current.started = true;
        })
        .catch(error => {
          console.error('Error starting audio recorder:', error);
        });
    } else if ((!connected || muted) && audioRecorderRef.current.started) {
      audioRecorder.off('data', onData);
      audioRecorder.stop();
      audioRecorderRef.current.started = false;
    }

    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, muted, audioRecorder, onData]);

  // Reset states when disconnected
  useEffect(() => {
    if (!connected) {
      setIsConnecting(false);
      if (audioRecorderRef.current.started) {
        audioRecorder.stop();
        audioRecorderRef.current.started = false;
      }
    }
  }, [connected, audioRecorder]);

  const handleConnect = async () => {
    if (isConnecting || connected) {
      return;
    }
    
    setIsConnecting(true);
    
    try {
      // Create config
      const config = {
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
        ...(useGrounding && { tools: [{ googleSearch: {} }] }),
      };

      await connect(config);
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connected) {
      return;
    }
    
    try {
      await disconnect();
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  const toggleMute = () => {
    if (connected) {
      setMuted(!muted);
    }
  };

  // Update mic button style based on volume
  const micButtonStyle = connected && !muted && volume > 0 ? {
    '--volume': `${Math.min(volume * 100, 50)}px`
  } as React.CSSProperties : {};

  return (
    <section className="control-tray">
      <nav className="actions-nav">
        <button
          className={cn('action-button mic-button', { 
            disabled: !connected 
          })}
          style={micButtonStyle}
          onClick={toggleMute}
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
            disabled={isConnecting}
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