---
title: Research
description: Whitepapers and the writing framework behind them.
sidebar:
  label: Overview
  order: 1
---

Design decisions in the Naughtian ecosystem are argued in public before they
are implemented. This section holds the long-form work: the mathematics, the
benchmarks, and the reasoning that the tool documentation only summarises.

These are papers, not product documentation. They are deliberately kept whole
rather than split into task-oriented pages — an argument loses its force when
you chop it into how-to guides.

## Papers

### [Kuberina: Maritime Stowage-Inspired Combinatorial Optimization](/research/kuberina-stowage-scheduling/)

Reformulates Kubernetes pod scheduling as a Multi-Dimensional Bin Packing
Problem by drawing a structural isomorphism with the Container Stowage Planning
Problem used by mega-vessel shipping lines.

Presents a three-phase hybrid pipeline — FFD warm start, genetic algorithm with
gang-aware repair, and CSP enforcement with forward checking — and evaluates it
on a synthetic benchmark of 186 nodes, 2,714 pods and 5,128 affinity
constraints.

Headline results: 100% scheduling success with zero constraint violations,
consolidation onto 152 of 186 nodes, 88.7% average CPU utilisation, and an
approximation ratio of α = 1.34 against the LP lower bound, in under 44
seconds. Monte Carlo testing puts significance at *p* < 10⁻⁴.

The tool it describes is [Kuberina](/kuberina/). For the shorter version of the
argument, see [the maritime
isomorphism](/kuberina/explanation/maritime-isomorphism/).

## Method

### [Whitepaper template](/research/whitepaper-template/)

The framework used to write every paper here. Rather than starting with prose,
it treats a paper as a list of interview questions — answer all of them and you
have roughly 80% of the content already.

## Citing this work

The Kuberina paper is archived on Zenodo with a DOI:
[10.5281/zenodo.21582492](https://doi.org/10.5281/zenodo.21582492).
