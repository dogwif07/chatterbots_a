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
  const hasGreetedRef = useRef(false);

  console.log('KeynoteCompanion render:', { connected, clientStatus: client.status });

  // Set up initial config
  useEffect(() => {
    console.log('Setting up initial config...');
    
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

    console.log('Setting config:', newConfig);
    setConfig(newConfig);
  }, [user, current, useGrounding, setConfig]);

  // Send greeting when connected
  useEffect(() => {
    console.log('Connection effect:', { connected, clientStatus: client.status, hasGreeted: hasGreetedRef.current });
    
    if (connected && client.status === 'connected' && !hasGreetedRef.current) {
      console.log('Sending initial greeting...');
      hasGreetedRef.current = true;
      
      setTimeout(() => {
        if (client.status === 'connected') {
          console.log('Actually sending greeting message');
          client.send(
            {
              text: 'Greet the user and introduce yourself and your role.',
            },
            true
          );
        } else {
          console.log('Client disconnected before greeting could be sent');
        }
      }, 1000);
    }
    
    // Reset greeting flag when disconnected
    if (!connected) {
      console.log('Resetting greeting flag due to disconnection');
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