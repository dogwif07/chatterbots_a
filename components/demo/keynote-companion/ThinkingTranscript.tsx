/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

type ThinkingTranscriptProps = {
  transcript: string;
};

export default function ThinkingTranscript({
  transcript,
}: ThinkingTranscriptProps) {
  if (!transcript) {
    return null;
  }

  return (
    <div className="thinking-transcript">
      <p>{transcript}</p>
    </div>
  );
}