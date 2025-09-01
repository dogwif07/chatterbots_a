/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GroundingChunk } from '@/lib/genai-live-client';

type GroundingReferencesProps = {
  chunks: GroundingChunk[];
};

export default function GroundingReferences({
  chunks,
}: GroundingReferencesProps) {
  if (!chunks || chunks.length === 0) {
    return null;
  }

  // Deduplicate chunks by URI, safely handling potentially malformed chunks
  const uniqueChunks = chunks.reduce((acc: GroundingChunk[], current) => {
    if (
      current.web?.uri &&
      !acc.some(item => item.web?.uri === current.web.uri)
    ) {
      acc.push(current);
    }
    return acc;
  }, []);

  if (uniqueChunks.length === 0) {
    return null;
  }

  return (
    <div className="grounding-references">
      <h3>References from Google Search:</h3>
      <ul>
        {uniqueChunks.map(
          (chunk, index) =>
            chunk.web?.uri && (
              <li key={index}>
                <a
                  href={chunk.web.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunk.web.title || chunk.web.uri}
                </a>
              </li>
            ),
        )}
      </ul>
    </div>
  );
}
