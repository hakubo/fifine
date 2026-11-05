// Reads the Mac's CPU, memory, disk and network figures. CPU comes from Node; the rest from the
// same counters Activity Monitor shows, read with stock macOS tools (vm_stat, sysctl, ioreg, netstat).
// Disk and network are byte counters, so their rates are the change since the previous reading.

import { cpus, totalmem } from 'node:os';

// One reading:
//   cpu   0..100 (all cores together)
//   mem   { used, total } in bytes, used counted like Activity Monitor's "Memory Used"
//         (app memory + wired + compressed), and pressure: 'normal' | 'warn' | 'critical'
//   disk  { read, write } in bytes per second, every block device
//   net   { in, out } in bytes per second, physical interfaces (en*) only, so VPN tunnels don't
//         count the same traffic twice
// A field is null when it couldn't be read, or on the first reading for the rates.
export function createSampler(run) {
  let prev = null; // { at, cpu, disk, net } counters from the previous reading

  return {
    // Drops the previous counters, so the next rates aren't averaged over a long pause.
    reset: () => (prev = null),
    async read() {
      const at = performance.now();
      const [vm, pressure, io, ifaces] = await Promise.all([
        run('/usr/bin/vm_stat', []),
        run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
        run('/usr/sbin/ioreg', ['-c', 'IOBlockStorageDriver', '-r', '-w', '0', '-d', '1']),
        run('/usr/sbin/netstat', ['-ibn']),
      ]);
      const now = { at, cpu: cpuTimes(), disk: io && diskBytes(io), net: ifaces && netBytes(ifaces) };
      const seconds = prev ? (now.at - prev.at) / 1000 : 0;
      const rate = (a, b) => (seconds > 0 && a != null && b != null ? Math.max(0, (a - b) / seconds) : null);
      const reading = {
        cpu: prev ? cpuPercent(prev.cpu, now.cpu) : null,
        mem: vm ? memory(vm, pressure) : null,
        disk: { read: rate(now.disk?.read, prev?.disk?.read), write: rate(now.disk?.write, prev?.disk?.write) },
        net: { in: rate(now.net?.in, prev?.net?.in), out: rate(now.net?.out, prev?.net?.out) },
      };
      prev = now;
      return reading;
    },
  };
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.irq + times.idle;
  }
  return { idle, total };
}

function cpuPercent(a, b) {
  const total = b.total - a.total;
  return total > 0 ? Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100)) : null;
}

// vm_stat prints "Pages wired down:  357902." lines under a header naming the page size.
export function memory(vm, pressureLevel) {
  const pageSize = Number(vm.match(/page size of (\d+) bytes/)?.[1] || 16384);
  const pages = {};
  for (const [, name, n] of vm.matchAll(/^"?([^:"]+)"?:\s+(\d+)\.?$/gm)) pages[name.trim()] = Number(n);
  const app = (pages['Anonymous pages'] ?? pages['Pages active'] ?? 0) - (pages['Pages purgeable'] ?? 0);
  const used = (Math.max(0, app) + (pages['Pages wired down'] ?? 0) + (pages['Pages occupied by compressor'] ?? 0)) * pageSize;
  const total = totalmem();
  // kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4 critical
  const level = Number(pressureLevel);
  return { used: Math.min(used, total), total, pressure: level >= 4 ? 'critical' : level >= 2 ? 'warn' : 'normal' };
}

// ioreg lists a "Statistics" dictionary per block device with cumulative "Bytes (Read)" and "Bytes (Write)".
export function diskBytes(io) {
  let read = 0;
  let write = 0;
  for (const [, n] of io.matchAll(/"Bytes \(Read\)"=(\d+)/g)) read += Number(n);
  for (const [, n] of io.matchAll(/"Bytes \(Write\)"=(\d+)/g)) write += Number(n);
  return { read, write };
}

// netstat -ibn: one <Link#n> row per interface with cumulative byte counts. The address column can
// be empty, so the counters are read from the right: ... Ibytes Opkts Oerrs Obytes Coll.
export function netBytes(table) {
  let bytesIn = 0;
  let bytesOut = 0;
  for (const line of table.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (!/^en\d+$/.test(f[0]) || !f[2]?.startsWith('<Link#') || f.length < 9) continue;
    bytesIn += Number(f[f.length - 5]) || 0;
    bytesOut += Number(f[f.length - 2]) || 0;
  }
  return { in: bytesIn, out: bytesOut };
}
