/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useCallback } from 'react';
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
    groundingChunks,
  } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const user = useUser();
  const { current } = useAgent();
  const { useGrounding } = useUI();
  const hasGreetedRef = useRef(false);
  const configSetRef = useRef(false);

  console.log('KeynoteCompanion render:', { connected, clientStatus: client.status });

  // Memoize config creation to prevent unnecessary recreations
  const createConfig = useCallback((): LiveConnectConfig => {
    const config: LiveConnectConfig = {
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
      config.tools = [{ googleSearch: {} }];
    }

    return config;
  }, [user.name, user.info, current.voice, current.name, current.personality, useGrounding]);

  // Set up initial config only once or when key dependencies change
  useEffect(() => {
    console.log('Setting up config...', { configSetRef: configSetRef.current, connected });
    
    // Only set config if it hasn't been set or if critical dependencies changed
    if (!configSetRef.current || !connected) {
      const newConfig = createConfig();
      console.log('Setting config:', newConfig);
      setConfig(newConfig);
      configSetRef.current = true;
    }
  }, [createConfig, setConfig, connected]);

  // Handle greeting when connected (separate from config)
  useEffect(() => {
    console.log('Connection effect:', { connected, clientStatus: client.status, hasGreeted: hasGreetedRef.current });
    
    if (connected && client.status === 'connected' && !hasGreetedRef.current) {
      console.log('Scheduling initial greeting...');
      hasGreetedRef.current = true;
      
      // Use a longer delay to ensure connection is fully stable
      const greetingTimeout = setTimeout(() => {
        console.log('Checking connection before sending greeting...', { clientStatus: client.status });
        if (client.status === 'connected') {
          console.log('Sending greeting message');
          try {
            client.send(
              {
                text: 'Greet the user and introduce yourself and your role.',
              },
              true
            );
          } catch (error) {
            console.error('Error sending greeting:', error);
          }
        } else {
          console.log('Client no longer connected, skipping greeting');
        }
      }, 2000); // Increased delay

      return () => clearTimeout(greetingTimeout);
    }
    
    // Reset greeting flag when disconnected
    if (!connected) {
      console.log('Resetting greeting flag due to disconnection');
      hasGreetedRef.current = false;
      configSetRef.current = false; // Allow config to be set again on reconnection
    }
  }, [client, connected]);

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}