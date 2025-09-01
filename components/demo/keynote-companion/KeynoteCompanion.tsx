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

  // This effect handles config updates and connection management based on UI state.
  useEffect(() => {
    // If a modal is open, ensure we are disconnected.
    if (showAgentEdit || showUserConfig) {
      if (connected && !isReconnectingRef.current) {
        disconnect().catch(error => {
          console.error('Failed to disconnect on modal open:', error);
        });
      }
      return; // Do not proceed to connect/reconnect logic
    }

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

    // Check if the config has actually changed to avoid unnecessary actions.
    const configChanged = JSON.stringify(newConfig) !== JSON.stringify(config);

    if (configChanged) {
      // If we are already connected, changing the config requires a reconnect.
      if (connected) {
        if (isReconnectingRef.current) {
          // A reconnect is already in progress. The effect will re-run
          // once it's done and pick up the latest config.
          return;
        }

        const reconnect = async () => {
          isReconnectingRef.current = true;
          try {
            await disconnect();
            await connect(newConfig);
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

        // Fire and forget; error handling is inside the async function.
        reconnect();
      }

      // Always update the config in the context. This will trigger a re-render,
      // but the reconnect action has already been initiated.
      setConfig(newConfig);
    }
  }, [
    user,
    current,
    useGrounding,
    config,
    connected,
    showAgentEdit,
    showUserConfig,
    setConfig,
    disconnect,
    connect,
    client,
  ]);

  // Initiate the session when the Live API connection is established
  // Instruct the model to send an initial greeting message
  useEffect(() => {
    const beginSession = async () => {
      if (!connected) return;
      client.send(
        {
          text: 'Greet the user and introduce yourself and your role.',
        },
        true
      );
    };
    beginSession();
  }, [client, connected]);

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}
