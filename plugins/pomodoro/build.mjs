import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { png, tiles } from '../../scripts/lib/icons.mjs';

const TOMATO = { bg: '#ff5f4a', dot: '#3ccf6e' };

export async function build({ images, plugin }) {
  tiles(images, { plugin: [72, TOMATO], category: [28, TOMATO], timer: [20, TOMATO] });
  // the key's default image is its own idle drawing (144px; the host scales it)
  const { render } = await import(join(plugin, 'draw.mjs'));
  png(images, ['timer-key', 'timer-key@2x'], render({ phase: 'focus', status: 'idle', remaining: 1500, total: 1500, today: 0 }));

  // the "Chime" sound: a rising bell arpeggio when focus ends, a falling one when a break ends
  const sounds = join(plugin, 'sounds');
  mkdirSync(sounds, { recursive: true });
  writeFileSync(join(sounds, 'focus-done.wav'), chime([659.25, 783.99, 1046.5]));
  writeFileSync(join(sounds, 'break-done.wav'), chime([1046.5, 783.99]));
}

// A soft bell: each note a few slightly inharmonic partials with their own decay, notes 180 ms apart.
function chime(notes, { rate = 44100, gap = 0.18, ring = 1.6 } = {}) {
  const PARTIALS = [
    [1, 1, 2.2],
    [2.0, 0.42, 3.4],
    [3.01, 0.18, 5],
    [4.17, 0.08, 7],
  ]; // [frequency ratio, amplitude, decay per second]
  const length = Math.ceil(rate * (gap * (notes.length - 1) + ring));
  const out = new Float32Array(length);
  notes.forEach((f, n) => {
    const at = Math.round(n * gap * rate);
    for (let i = 0; at + i < length; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.004);
      let v = 0;
      for (const [ratio, amp, decay] of PARTIALS) v += amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * f * ratio * t);
      out[at + i] += v * attack;
    }
  });
  const fadeFrom = length - Math.round(rate * 0.25);
  for (let i = fadeFrom; i < length; i++) out[i] *= (length - i) / (length - fadeFrom);
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + length * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round((out[i] / peak) * 0.8 * 32767), 44 + i * 2);
  return wav;
}
