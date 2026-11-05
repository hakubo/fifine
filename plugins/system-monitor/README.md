# System Monitor

Keys with your Mac's CPU, memory, disk and network activity, updated every 2 seconds. Each has a graph of the last two minutes. Press any of them to open Activity Monitor.

| Key | Shows |
| --- | --- |
| System | CPU and memory as a percentage, disk (reads + writes) and network (in + out) per second, each with a bar |
| CPU | Use across all cores, as Activity Monitor's CPU graph counts it |
| Memory | Memory used as a share of the total, and used / total in GB |
| Disk | Writes (`W`, orange) and reads (`R`, blue) per second |
| Network | Download (`↓`, blue) and upload (`↑`, orange) per second |

Colours:

- CPU is green below 60%, amber up to 85%, red above.
- Memory follows macOS memory pressure, like Activity Monitor's Memory Pressure graph: green, amber, red. Memory can sit at 90% used and still be green.
- The System key's disk and network bars use a log scale from 1 KB/s to 1 GB/s. The Disk and Network graphs scale to the highest value shown, but never below 1 MB/s (disk) or 100 KB/s (network), so an idle machine shows a flat line rather than noise.

## How it works

- CPU comes from Node's `os.cpus()` times. Memory comes from `vm_stat` (app memory + wired + compressed, which is Activity Monitor's "Memory Used") and the pressure level from `sysctl kern.memorystatus_vm_pressure_level`.
- Disk rates come from the byte counters `ioreg` lists for every block device. Network rates come from `netstat -ibn`, summed over the physical `en*` interfaces only, so traffic through a VPN tunnel isn't counted twice.
- Readings are taken only while at least one key is on screen. After a pause the graphs start over.
- Rates use decimal units (1 MB = 1,000,000 bytes) and memory uses binary GB, both as Activity Monitor shows them.

## Install

```sh
node scripts/install.mjs system-monitor
```

Log: `~/Library/Logs/fifine/system-monitor.log`.
