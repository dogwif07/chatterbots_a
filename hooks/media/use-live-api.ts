/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient, GroundingChunk } from '../../lib/genai-live-client';
import { LiveConnectConfig } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { DEFAULT_LIVE_API_MODEL } from '../../lib/constants';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: (overrideConfig?: LiveConnectConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  connected: boolean;

  volume: number;
  groundingChunks: GroundingChunk[];
};

export function useLiveApi({
  apiKey,
  model = DEFAULT_LIVE_API_MODEL,
}: {
  apiKey: string;
  model?: string;
}): UseLiveApiResults {
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const disconnectResolver = useRef<(() => void) | null>(null);
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' })
        .then((audioCtx: AudioContext) => {
          audioStreamerRef.current = new AudioStreamer(audioCtx);
          audioStreamerRef.current
            .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
              setVolume(ev.data.volume);
            })
            .then(() => {
              // Successfully added worklet
            })
            .catch(err => {
              console.error('Error adding worklet:', err);
            });
        })
        .catch(error => {
          console.error('Failed to initialize output audio context:', error);
          client.emit(
            'error',
            new ErrorEvent('error', {
              error,
              message:
                'Could not initialize audio output. Please check browser permissions and reload.',
            })
          );
        });
    }
  }, [audioStreamerRef, client]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
      setGroundingChunks([]);
    };

    const onClose = () => {
      setConnected(false);
      if (disconnectResolver.current) {
        disconnectResolver.current();
        disconnectResolver.current = null;
      }
    };

    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };

    const onGrounding = (chunks: GroundingChunk[]) => {
      setGroundingChunks(prev => [...prev, ...chunks]);
    };

    // Bind event listeners
    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);
    client.on('grounding', onGrounding);

    return () => {
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('grounding', onGrounding);
    };
  }, [client]);

  const connect = useCallback(
    async (overrideConfig?: LiveConnectConfig) => {
      // Prevent multiple connection attempts
      if (connected) {
        return;
      }
      
      const configToUse = overrideConfig || config;
      if (!configToUse) {
        throw new Error('config has not been set');
      }
      
      setGroundingChunks([]);
      try {
        await client.connect(configToUse);
      } catch (error) {
        setConnected(false);
        throw error;
      }
    },
    [client, config]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    // If not connected, return immediately
    if (!connected && !disconnectPromiseRef.current) {
      return Promise.resolve();
    }
    
    // If a disconnect is already in progress, return its promise
    if (disconnectPromiseRef.current) {
      return disconnectPromiseRef.current;
    }

    const promise = new Promise<void>((resolve, reject) => {
      disconnectResolver.current = resolve;
      try {
        client.disconnect();
      } catch (error) {
        disconnectResolver.current = null; // Clean up resolver on sync error
        reject(error);
      }
    });

    disconnectPromiseRef.current = promise;

    // Function to clear the promise ref once operation is complete
    const clearPromiseRef = () => {
      disconnectPromiseRef.current = null;
    };

    // Attach cleanup to the promise
    promise.then(clearPromiseRef, clearPromiseRef);

    return promise;
  }, [client, connected]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
    groundingChunks,
  };
}
