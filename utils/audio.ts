import { Blob } from '@google/genai';

/**
 * Downsamples audio data to 16kHz.
 * Gemini Live API requires 16kHz audio. If the browser records at 44.1k or 48k,
 * we must resample it, otherwise the audio sounds slowed down and recognition fails.
 */
function downsampleTo16k(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.ceil(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    // Simple linear interpolation for better quality than dropping samples
    const originalIndex = i * ratio;
    const index1 = Math.floor(originalIndex);
    const index2 = Math.min(Math.ceil(originalIndex), buffer.length - 1);
    const t = originalIndex - index1;
    
    // Check bounds to be safe
    const p1 = buffer[index1] || 0;
    const p2 = buffer[index2] || 0;
    
    result[i] = p1 * (1 - t) + p2 * t;
  }
  return result;
}

/**
 * Converts Float32Array PCM data to the specific Blob format required by Gemini Live API.
 * Ensures data is 16kHz mono PCM.
 */
export function createPcmBlob(data: Float32Array, inputSampleRate: number): Blob {
  const downsampledData = downsampleTo16k(data, inputSampleRate);
  const l = downsampledData.length;
  const int16 = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    // Clamp values to [-1, 1] before converting to PCM16
    const s = Math.max(-1, Math.min(1, downsampledData[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: base64EncodeUint8Array(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function base64EncodeUint8Array(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const COLORS = [
  'text-pink-500',
  'text-purple-600',
  'text-indigo-500',
  'text-cyan-500',
  'text-teal-400',
  'text-yellow-400',
  'text-orange-500',
  'text-red-500',
];

export function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}