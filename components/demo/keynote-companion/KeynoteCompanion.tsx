/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import { LiveConnectConfig, Modality } from '@google/genai';

import BasicFace from '../basic-face/BasicFace';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { createSystemInstructions } from '@/lib/prompts';
import { useAgent, useUI, useUser } from '@/lib/state';
import GroundingReferences from './GroundingReferences';

export default function KeynoteCompanion() {
  const {
    client,
    connected,
    setConfig,
    config,
    connect,
    disconnect,
    groundingChunks,
  } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const user = useUser();
  const { current } = useAgent();
  const { useGrounding, showAgentEdit, showUserConfig } = useUI();
  const isReconnectingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Update config whenever settings change (but don't auto-connect)
  useEffect(() => {
    const newConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: current.voice },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: createSystemInstructions(current, user),
          },
        ],
      },
    };

    if (useGrounding) {
      newConfig.tools = [{ googleSearch: {} }];
    }

    // Only update config if it has actually changed
    const configChanged = JSON.stringify(newConfig) !== JSON.stringify(config);
    if (configChanged) {
      setConfig(newConfig);
    }
  }, [user, current, useGrounding, setConfig, config]);

  // Handle modal state - disconnect when modals are open
  useEffect(() => {
    if (showAgentEdit || showUserConfig) {
      if (connected && !isReconnectingRef.current) {
        disconnect().catch(error => {
          console.error('Failed to disconnect on modal open:', error);
        });
      }
    }
  }, [showAgentEdit, showUserConfig, connected, disconnect]);

  // Handle reconnection when connected and config changes
  useEffect(() => {
    // Don't reconnect if modals are open
    if (showAgentEdit || showUserConfig) {
      return;
    }

    // Only reconnect if we're already connected and config changed
    if (connected && hasInitializedRef.current && !isReconnectingRef.current) {
      const reconnect = async () => {
        isReconnectingRef.current = true;
        try {
          await disconnect();
          await connect(config);
        } catch (error) {
          console.error('Failed to reconnect after settings change:', error);
          client.emit(
            'error',
            new ErrorEvent('error', {
              error: error as Error,
              message: 'Failed to apply new settings. Please try again.',
            })
          );
        } finally {
          isReconnectingRef.current = false;
        }
      };
      reconnect();
    }

    hasInitializedRef.current = true;
  }, [config, connected, showAgentEdit, showUserConfig, disconnect, connect, client]);

  // Send initial greeting when connection is established
  useEffect(() => {
    const beginSession = async () => {
      // Wait a bit to ensure the connection is fully established
      if (connected && client.status === 'connected' && !showAgentEdit && !showUserConfig) {
        setTimeout(() => {
          if (client.status === 'connected') {
            client.send(
              {
                text: 'Greet the user and introduce yourself and your role.',
              },
              true
            );
          }
        }, 500);
      }
    };
    beginSession();
  }, [client, connected, showAgentEdit, showUserConfig]);

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}