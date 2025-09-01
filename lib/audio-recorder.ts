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

import { audioContext } from './utils';
import AudioRecordingWorklet from './worklets/audio-processing';
import VolMeterWorket from './worklets/vol-meter';

import { createWorketFromSrc } from './audioworklet-registry';
import EventEmitter from 'eventemitter3';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// FIX: Define event types for AudioRecorder for strong typing.
type AudioRecorderEvents = {
  data: (base64: string) => void;
  volume: (volume: number) => void;
};

// FIX: Switched from inheritance to composition for EventEmitter to fix type resolution issues.
export class AudioRecorder {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;
  private emitter = new EventEmitter<AudioRecorderEvents>();

  constructor(public sampleRate = 16000) {}

  // FIX: Delegating event emitter methods to the internal emitter instance.
  on<K extends keyof AudioRecorderEvents>(
    event: K,
    listener: AudioRecorderEvents[K],
    context?: any,
  ): this {
    // FIX: Cast listener to `any` to bypass TypeScript's inability to correlate
    // the listener type with the event name in this generic implementation.
    // The public API remains type-safe.
    this.emitter.on(event, listener as any, context);
    return this;
  }

  off<K extends keyof AudioRecorderEvents>(
    event: K,
    listener?: AudioRecorderEvents[K],
    context?: any,
    once?: boolean,
  ): this {
    // FIX: Cast listener to `any` to bypass TypeScript's inability to correlate
    // the listener type with the event name in this generic implementation.
    // The public API remains type-safe.
    this.emitter.off(event, listener as any, context, once);
    return this;
  }

  emit<K extends keyof AudioRecorderEvents>(
    event: K,
    ...args: Parameters<AudioRecorderEvents[K]>
  ): boolean {
    // FIX: Cast args to `any` to bypass TypeScript's inability to correlate
    // the arguments with the event name in this generic implementation.
    // The public API remains type-safe.
    return this.emitter.emit(event, ...(args as any));
  }

  start(): Promise<void> {
    if (this.starting) {
      return this.starting;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('Could not request user media'));
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = 'audio-recorder-worklet';
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // Worklet processes recording floats and messages converted buffer
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit('data', arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // vu meter worklet
        const vuWorkletName = 'vu-meter';
        await this.audioContext.audioWorklet.addModule(
          createWorketFromSrc(vuWorkletName, VolMeterWorket)
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit('volume', ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        this.starting = null;
      }
    });

    return this.starting;
  }

  stop() {
    // It is plausible that stop would be called before start completes,
    // such as if the Websocket immediately hangs up
    const handleStop = () => {
      try {
        this.source?.disconnect();
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = undefined;
        this.recordingWorklet = undefined;
        this.vuWorklet = undefined;
      } catch (error) {
        console.error('Error stopping audio recorder:', error);
      }
    };
    if (this.starting) {
      this.starting.then(handleStop, handleStop);
      return;
    }
    handleStop();
  }
}