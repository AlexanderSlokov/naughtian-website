# Naughtian documentation

The documentation portal for the Naughtian ecosystem — [Kuberina][kuberina],
[Helvilette][helvilette] and [Kallisto][kallisto] — plus the research papers
behind them.

Built with [Astro][astro] and [Starlight][starlight].

[kuberina]: https://github.com/AlexanderSlokov/kuberina
[helvilette]: https://github.com/AlexanderSlokov/Helvilette
[kallisto]: https://github.com/AlexanderSlokov/naughtian-kallisto
[astro]: https://astro.build
[starlight]: https://starlight.astro.build

## Commands

| Command | Action |
| :--- | :--- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the dev server at `localhost:4321` |
| `pnpm build` | Build the production site to `./dist/` |
| `pnpm preview` | Preview the build locally |

## How the content is organised

Each project gets one directory under `src/content/docs/`, structured along
[Diátaxis][diataxis] lines:

```
src/content/docs/
├─ index.mdx              ← ecosystem landing page
├─ ecosystem/             ← cross-cutting: overview, stack, naming, roadmap
├─ <project>/
│  ├─ index.mdx           ← project landing page
│  ├─ tutorials/          ← learning-oriented, start-to-finish walkthroughs
│  ├─ how-to/             ← task-oriented recipes for someone who knows the tool
│  ├─ reference/          ← information-oriented, exhaustive, dry
│  └─ explanation/        ← understanding-oriented, the "why"
└─ research/              ← whitepapers, kept whole rather than split
```

[diataxis]: https://diataxis.fr

The four quadrants are not interchangeable. Before adding a page, decide which
one it belongs to:

- A **tutorial** promises a result and takes the reader all the way there. It
  never says "you could also…".
- A **how-to** assumes competence and solves one problem. It may list
  alternatives.
- A **reference** describes what exists. It does not teach or persuade.
- An **explanation** argues. It has opinions, context, and admits limitations.

Research papers deliberately sit outside this scheme. An argument loses its
force when chopped into task-oriented pages, so papers stay whole.

## Adding a new project

1. Create `src/content/docs/<project>/` with an `index.mdx` and whichever of
   the four subdirectories apply. Empty directories will fail the build — every
   directory referenced by the sidebar needs at least one page.

2. Add one line to the sidebar in `astro.config.mjs`:

   ```js
   project({ label: 'Kalena', dir: 'kalena', status: 'Alpha' }),
   ```

   The `project()` helper generates the Overview link and the four Diátaxis
   groups. Omit `status` once a project is no longer pre-release.

3. Add it to the landing page card grid in `src/content/docs/index.mdx` and to
   the tables in `src/content/docs/ecosystem/roadmap.md`.

## Writing conventions

**Verify against source, not against READMEs.** Several pages here document
behaviour that contradicts the upstream README, because the code disagreed with
it. Where that happens, the page says so explicitly and names the file. Keep
doing this — a docs site that repeats a README's mistakes is worth less than no
docs at all.

**Mark unshipped features as unshipped.** Roadmap items are labelled as
planned, and prototype components carry warnings. Do not describe intended
behaviour in the present tense.

**Link across projects.** The ecosystem argument only works if the pieces
reference each other.

## Notes

- Maths is rendered at build time via `remark-math` and `rehype-mathjax`.
- Justified text is opt-in per page through `head` frontmatter, applied only to
  research papers.
- The PDF of the Kuberina paper lives in `public/pdfs/`.
