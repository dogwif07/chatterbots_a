import { useRef, useEffect } from 'react';
import BasicFace from './basic-face/BasicFace';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useAgent } from '@/lib/state';
import GroundingReferences from './keynote-companion/GroundingReferences';

export default function BasicFaceDisplay() {
  const { groundingChunks, client, connected } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const { current } = useAgent();
  const hasGreetedRef = useRef(false);

  // Handle greeting only when properly connected
  useEffect(() => {
    if (connected && client.status === 'connected') {
      if (!hasGreetedRef.current) {
        hasGreetedRef.current = true;
        
        // Send greeting after a stable delay
        const greetingTimeout = setTimeout(() => {
          if (client.status === 'connected' && connected) {
            try {
              client.send({
                text: 'Greet the user and introduce yourself and your role.',
              }, true);
            } catch (error) {
              console.error('Error sending greeting:', error);
            }
          }
        }, 2000);

        return () => clearTimeout(greetingTimeout);
      }
    } else {
      // Reset greeting when disconnected
      hasGreetedRef.current = false;
    }
  }, [client, connected]);

  return (
    <div className="keynote-companion">
      <BasicFace canvasRef={faceCanvasRef} color={current.bodyColor} />
      <GroundingReferences chunks={groundingChunks} />
    </div>
  );
}