---
title: Push a replica
description: Copy one project's pages from the origin into the project's own docs folder through a pull request.
---

This page shows how to bring one project's `docs/` folder up to date with the origin,
the repository of this site.
The `mannaz push` command does the copy and opens a pull request in the project, so
the change goes through review like any other.
The task is done when the pull request is merged and a second `mannaz push` reports
that the replica is up to date.

## Before you begin

You need the following tools:

- Go 1.27 or later, to build `mannaz`.
- `git`, with push access to the project repository.
- The GitHub CLI, `gh`, logged in to an account that can open pull requests in the
  project repository. To check the login, run `gh auth status`.

You also need two local clones:

- A clone of `naughtian-website`, the origin.
- A clone of `helvilette-mannaz`, to build the tool.

To build the tool, run the following command in the `helvilette-mannaz` clone:

```shell
make build
```

The command writes the binary to `bin/mannaz`.

## Steps

1. Add the project to `mannaz.yaml` at the root of the origin.
   The following entry is the one for Helvilette Mannaz itself:

    ```yaml
    version: 1
    replicas:
      - name: helvilette-mannaz
        repository: https://github.com/AlexanderSlokov/helvilette-mannaz.git
        branch: main
        source: src/content/docs/helvilette-mannaz
        target: docs
        exclude:
          - plans/**
    ```

    The fields mean the following:

    - `source` is the folder in the origin that holds the project's pages.
    - `target` is the folder in the project that receives them.
    - `branch` is the project branch that the pull request targets.
    - `exclude` lists paths under `target` that Mannaz leaves alone, such as plans
      that belong only to the project.

1. Merge the change to `mannaz.yaml` and the pages into the origin's `main` branch.
   `mannaz push` copies from `main` by default, so unmerged pages stay out of the
   project.

1. Run `mannaz push` with the replica name and the path to the origin clone:

    ```shell
    bin/mannaz push helvilette-mannaz --origin ../naughtian-website
    ```

    The output is similar to this:

    ```console
    helvilette-mannaz: pull request opened (origin 729922b4d0a1) https://github.com/AlexanderSlokov/helvilette-mannaz/pull/1
    ```

1. Review and merge the pull request in the project repository.

1. Run the same `mannaz push` command again to confirm the result.

    The output is similar to this:

    ```console
    helvilette-mannaz: up to date (origin 729922b4d0a1)
    ```

## Discussion

`mannaz push` reports one of four outcomes:

| Outcome | Meaning |
|---|---|
| `pull request opened` | The project had no open sync pull request, so Mannaz opened one. |
| `pull request updated` | The origin changed while a sync pull request was open, so Mannaz replaced its commit. |
| `pull request current` | The open sync pull request already holds the origin's pages. |
| `up to date` | The project's branch already holds the origin's pages. |

When someone edits the pages inside the project, the next run stops with exit status 1
and lists each file.
The output is similar to this:

```console
mannaz: replica helvilette-mannaz has edits under docs that origin commit 729922b4d0a1 does not have: edited docs/index.mdx; expected docs to match the origin, so move these edits into the origin first
```

To continue, apply the same edit to the page in the origin, merge it, and revert the
edit in the project.

The `Mannaz-Origin-Rev` line must survive the merge.
A merge commit and a rebase merge keep it.
A squash merge keeps it unless the repository builds squash messages from the pull
request title alone.

## What's next

- [Helvilette Mannaz](/helvilette-mannaz/) describes the origin and replicas.
