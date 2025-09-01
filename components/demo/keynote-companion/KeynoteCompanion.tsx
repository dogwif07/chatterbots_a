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
  const lastConfigHash = useRef('');

  console.log('KeynoteCompanion render:', { connected, clientStatus: client.status });

  // Create a stable config hash to prevent unnecessary updates
  const configHash = `${user.name || ''}-${user.info || ''}-${current.voice}-${current.name}-${current.personality}-${useGrounding}`;

  // Memoize config creation with stable dependencies
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

  // Set up config only when hash changes
  useEffect(() => {
    if (lastConfigHash.current !== configHash) {
      console.log('Config hash changed, updating config...', { 
        oldHash: lastConfigHash.current, 
        newHash: configHash 
      });
      
      const newConfig = createConfig();
      console.log('Setting config:', newConfig);
      setConfig(newConfig);
      lastConfigHash.current = configHash;
      configSetRef.current = true;
    }
  }, [configHash, createConfig, setConfig]);

  // Handle greeting only when truly connected (separate from config)
  useEffect(() => {
    console.log('Connection effect:', { connected, clientStatus: client.status, hasGreeted: hasGreetedRef.current });
    
    if (connected && client.status === 'connected' && !hasGreetedRef.current && configSetRef.current) {
      console.log('Scheduling initial greeting...');
      hasGreetedRef.current = true;
      
      // Delay greeting to ensure stable connection
      const greetingTimeout = setTimeout(() => {
        console.log('Checking connection before sending greeting...', { clientStatus: client.status, connected });
        
        // Double-check connection is still stable
        if (client.status === 'connected' && connected) {
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
          console.log('Connection no longer stable, skipping greeting');
          hasGreetedRef.current = false; // Reset so it can try again
        }
      }, 3000); // Longer delay for stability

      return () => {
        clearTimeout(greetingTimeout);
      };
    }
    
    // Reset greeting flag when disconnected
    if (!connected || client.status !== 'connected') {
      if (hasGreetedRef.current) {
        console.log('Resetting greeting flag due to disconnection');
        hasGreetedRef.current = false;
      }
    }
  }, [client, connected, configSetRef.current]); // Stable dependencies

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}