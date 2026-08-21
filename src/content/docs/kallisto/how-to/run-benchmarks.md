---
title: Run the benchmarks
description: Validate Kallisto's throughput and latency claims using k6 or wrk2.
sidebar:
  order: 2
---

Kallisto makes performance claims, so it ships the means to check them. There
are two harnesses: a containerised k6 run that needs nothing installed, and a
`wrk2` setup for more careful latency measurement.

## Quick check with k6

A prepared benchmark container with k6 already set up:

```bash
docker run -it --rm ghcr.io/alexanderslokov/kallisto-tester:latest make bench
```

This is the fastest way to get a number. It requires no local toolchain.

## Latency benchmarks with wrk2

For what the project calls the more "proudly" benchmarks, use `wrk2` with the
provided script. The signature is:

```bash
./benchmarks/server/run_release_bench.sh <threads> <connections> <duration> <rate>
```

Benchmark GET latency at roughly 50% of capacity:

```bash
./benchmarks/server/run_release_bench.sh 2 200 10s 40000
```

The same invocation shape is used for the PUT path.

:::caution[Upstream documentation gap]
The README's benchmark section carries a `TODO` for the `wrk2` setup
instructions, and lists the identical command for both the GET and the PUT
benchmark. Check `benchmarks/server/run_release_bench.sh` directly to confirm
how the two paths are selected before reporting results.
:::

### Why wrk2 rather than wrk

`wrk2` maintains a constant request *rate* rather than a constant concurrency,
which avoids coordinated omission — the measurement artifact where a stalled
system appears to have better latency because the load generator stopped
sending requests while waiting.

For a cache on the request path, tail latency under sustained load is the
number that matters, so the distinction is not academic.

## Makefile targets

| Target | Purpose |
|---|---|
| `make bench-server` | Benchmark the server |
| `make bench-release` | Release-mode benchmark |
| `make bench-laptop` | Benchmark profile tuned for a laptop |
| `make full-bench-server` | `clean` → `build-server` → `bench-server` |

`full-bench-server` is the one to use for a clean, reproducible measurement,
since it rebuilds from scratch first.

## Interpreting results

Kallisto's stated performance model is **scale-per-core**: the better your
AMD64 chip, the better it performs. Encryption uses AES-256-GCM with hardware
acceleration, which requires the **AES-NI instruction set** — benchmarking on
hardware without it will produce numbers that are not comparable.

The server is built on a shared-nothing Rust architecture with separate hot and
cold async paths, so results are sensitive to core count and pinning. Record
the hardware alongside any number you intend to compare later.

Archived benchmark results, including comparisons against DragonflyDB and the
historical C++ implementation, live in the Kallisto repository's own docs under
`docs/content/docs/references/benchmarks/`.
