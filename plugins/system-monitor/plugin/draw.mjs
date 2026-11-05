// Draws the System Monitor keys. Everything is in the image (the host's title stays empty).
//
//   CPU / Memory              Disk / Network             Overview
//   CPU                        DISK                       CPU        37%
//       37%                   W         3.1 MB/s         ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
//                             R          12 MB/s         MEM        87%
//   ╭──────────────╮          ╭──────────────╮           ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
//   │ ▁▂▃▅▃▂▁▂▅▇▅▃ │          │ ▁▂▃▅▃▂▁▂▅▇▅▃ │           DISK  3.1 MB/s  ...
//   ╰──────────────╯          ╰──────────────╯
//
// The graphs show the last HISTORY readings, newest on the right.

import { canvas } from './lib/draw.mjs';
import { dataUrl } from './lib/png.mjs';

const SIZE = 144;
const C = SIZE / 2;
const BG = '#141418';
const PANEL = '#1d1d23';
const TRACK = '#2a2a32';
const TEXT = '#f4f4f6';
const DIM = '#7c7c88';
const GREEN = '#2fd08a';
const AMBER = '#ffb340';
const RED = '#ff5f4a';
const BLUE = '#4c9dff'; // disk reads, network in
const ORANGE = '#ff7a45'; // disk writes, network out

export const HISTORY = 60;

const PRESSURE = { normal: GREEN, warn: AMBER, critical: RED };
const cpuColor = (v) => (v == null || v < 60 ? GREEN : v < 85 ? AMBER : RED);
const memPercent = (m) => (m ? (m.used / m.total) * 100 : null);
const percent = (v) => (v == null ? '--' : `${Math.round(v)}%`);
// Memory in binary GB, as Activity Monitor and Apple count it (a 36 GB Mac shows 36, not 38.7).
const GIB = 2 ** 30;
const gb = (b) => (b / GIB >= 9.95 ? Math.round(b / GIB) : (b / GIB).toFixed(1));

// Bytes per second, in decimal units like Activity Monitor: 512 KB/s, 3.1 MB/s, 45 MB/s, 1.2 GB/s.
export function rate(b) {
  if (b == null) return '--';
  if (b < 999.5e3) return `${Math.round(b / 1e3)} KB/s`;
  if (b < 9.95e6) return `${(b / 1e6).toFixed(1)} MB/s`;
  if (b < 999.5e6) return `${Math.round(b / 1e6)} MB/s`;
  return `${(b / 1e9).toFixed(1)} GB/s`;
}

// A rate as a bar length: log scale from 1 KB/s (empty) to 1 GB/s (full).
const rateBar = (b) => (b ? Math.max(0, Math.min(100, (Math.log10(b / 1e3) / 6) * 100)) : 0);

// ---- pieces

const label = (c, text, color = DIM) => c.text(14, 13, text, { h: 11, stroke: 2, color, track: 0.3, align: 'left' });

// The graph panel at the bottom: each series is { values, color }, values 0..scale, oldest first.
// Areas are drawn first so every line stays visible on top.
function graph(c, series, scale) {
  const [x0, y0, x1, y1] = [10, 82, 134, 134];
  c.rect(x0, y0, x1, y1, PANEL, { r: 9 });
  const inset = 5;
  const step = (x1 - x0 - 2 * inset) / (HISTORY - 1);
  const plots = series.map(({ values, color }) => {
    const pts = [];
    values.slice(-HISTORY).forEach((v, i, all) => {
      if (v == null) return;
      const x = x1 - inset - (all.length - 1 - i) * step;
      const y = y1 - inset - (y1 - y0 - 2 * inset) * Math.max(0, Math.min(1, v / scale));
      pts.push([x, y]);
    });
    return { pts, color };
  });
  for (const { pts, color } of plots) c.area(pts, y1 - inset, color, 0.22);
  for (const { pts, color } of plots) c.line(pts, 2.2, color);
}

// A scale for rate graphs: the recent peak with some headroom, never below `floor`, so an idle
// disk or network doesn't fill the graph with noise.
const rateScale = (lists, floor) => Math.max(floor, ...lists.flat().filter((v) => v != null)) * 1.15;

// Two rows of an indicator glyph and a rate, for Disk and Network.
function rateRows(c, rows) {
  rows.forEach(({ mark, value, color }, i) => {
    const y = 36 + i * 22;
    c.text(14, y, mark, { h: 14, stroke: 2.6, color, align: 'left' });
    c.text(130, y, rate(value), { h: 14, stroke: 2.4, color: value == null ? DIM : TEXT, track: 0.16, align: 'right' });
  });
}

// ---- keys

function cpuKey(c, history) {
  const now = history.at(-1)?.cpu ?? null;
  const color = cpuColor(now);
  label(c, 'CPU');
  c.text(C, 36, percent(now), { h: 30, stroke: 4.6, color: now == null ? DIM : TEXT, track: 0.14 });
  graph(c, [{ values: history.map((r) => r.cpu), color }], 100);
}

function memKey(c, history) {
  const m = history.at(-1)?.mem ?? null;
  const color = PRESSURE[m?.pressure] ?? GREEN;
  label(c, 'MEM');
  if (m) c.text(130, 13, `${gb(m.used)}/${gb(m.total)} GB`, { h: 11, stroke: 2, color: DIM, track: 0.18, align: 'right' });
  c.text(C, 36, percent(memPercent(m)), { h: 30, stroke: 4.6, color: m ? TEXT : DIM, track: 0.14 });
  graph(c, [{ values: history.map((r) => memPercent(r.mem)), color }], 100);
}

function diskKey(c, history) {
  const now = history.at(-1)?.disk ?? {};
  const read = history.map((r) => r.disk?.read);
  const write = history.map((r) => r.disk?.write);
  label(c, 'DISK');
  rateRows(c, [
    { mark: 'W', value: now.write, color: ORANGE },
    { mark: 'R', value: now.read, color: BLUE },
  ]);
  graph(c, [{ values: read, color: BLUE }, { values: write, color: ORANGE }], rateScale([read, write], 1e6));
}

function netKey(c, history) {
  const now = history.at(-1)?.net ?? {};
  const down = history.map((r) => r.net?.in);
  const up = history.map((r) => r.net?.out);
  label(c, 'NET');
  rateRows(c, [
    { mark: '↓', value: now.in, color: BLUE },
    { mark: '↑', value: now.out, color: ORANGE },
  ]);
  graph(c, [{ values: down, color: BLUE }, { values: up, color: ORANGE }], rateScale([down, up], 1e5));
}

// Four rows of label, value and bar. Disk and network show reads + writes and in + out together.
function overviewKey(c, history) {
  const r = history.at(-1) ?? {};
  const sum = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  const disk = sum(r.disk?.read, r.disk?.write);
  const net = sum(r.net?.in, r.net?.out);
  const rows = [
    { name: 'CPU', value: percent(r.cpu), bar: r.cpu ?? 0, color: cpuColor(r.cpu) },
    { name: 'MEM', value: percent(memPercent(r.mem)), bar: memPercent(r.mem) ?? 0, color: PRESSURE[r.mem?.pressure] ?? GREEN },
    { name: 'DISK', value: rate(disk), bar: rateBar(disk), color: ORANGE },
    { name: 'NET', value: rate(net), bar: rateBar(net), color: BLUE },
  ];
  rows.forEach(({ name, value, bar, color }, i) => {
    const y = 12 + i * 32;
    c.text(14, y, name, { h: 10, stroke: 1.9, color: DIM, track: 0.3, align: 'left' });
    c.text(130, y, value, { h: 10, stroke: 1.9, color: value === '--' ? DIM : TEXT, track: 0.16, align: 'right' });
    c.rect(14, y + 15, 130, y + 21, TRACK, { r: 3 });
    if (bar > 0) c.rect(14, y + 15, 14 + Math.max(6, (116 * bar) / 100), y + 21, color, { r: 3 });
  });
}

const KEYS = { cpu: cpuKey, memory: memKey, disk: diskKey, network: netKey, overview: overviewKey };

// The key `kind` for a list of readings (oldest first; see sample.mjs).
export function render(kind, history) {
  const c = canvas(SIZE);
  c.fill(BG);
  KEYS[kind](c, history);
  return c.png();
}

export const keyImage = (kind, history) => dataUrl(render(kind, history));
