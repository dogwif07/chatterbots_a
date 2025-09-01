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
  connect: (config: LiveConnectConfig) => Promise<void>;
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

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);

  // Initialize audio context and streamer
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' })
        .then((audioCtx: AudioContext) => {
          audioStreamerRef.current = new AudioStreamer(audioCtx);
          audioStreamerRef.current
            .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
              setVolume(ev.data.volume);
            })
            .catch(err => {
              console.error('Error adding worklet:', err);
            });
        })
        .catch(error => {
          console.error('Failed to initialize output audio context:', error);
        });
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
      setGroundingChunks([]);
    };

    const onClose = () => {
      setConnected(false);
      setGroundingChunks([]);
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
    async (config: LiveConnectConfig) => {
      if (connected || client.status === 'connecting') {
        return;
      }
      
      setGroundingChunks([]);
      
      try {
        const success = await client.connect(config);
        if (!success) {
          throw new Error('Failed to connect to Live API');
        }
      } catch (error) {
        console.error('Connection error:', error);
        setConnected(false);
        throw error;
      }
    },
    [client, connected]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (!connected) {
      return;
    }
    
    try {
      client.disconnect();
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
    
    setConnected(false);
  }, [client, connected]);

  return {
    client,
    connect,
    connected,
    disconnect,
    volume,
    groundingChunks,
  };
}