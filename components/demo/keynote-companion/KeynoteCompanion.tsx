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
    groundingChunks,
  } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const user = useUser();
  const { current } = useAgent();
  const { useGrounding } = useUI();
  const hasSetInitialConfigRef = useRef(false);
  const hasGreetedRef = useRef(false);

  // Set initial config once on mount
  useEffect(() => {
    if (!hasSetInitialConfigRef.current) {
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

      setConfig(newConfig);
      hasSetInitialConfigRef.current = true;
    }
  }, []);

  // Update config when settings change (but don't auto-reconnect)
  useEffect(() => {
    if (!hasSetInitialConfigRef.current) return;

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

  // Send initial greeting when connection is first established
  useEffect(() => {
    if (connected && client.status === 'connected' && !hasGreetedRef.current) {
      hasGreetedRef.current = true;
      setTimeout(() => {
        if (client.status === 'connected') {
          client.send(
            {
              text: 'Greet the user and introduce yourself and your role.',
            },
            true
          );
        }
      }, 1000);
    }
    
    // Reset greeting flag when disconnected
    if (!connected) {
      hasGreetedRef.current = false;
    }
  }, [client, connected]);

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}