# Reverse Engineering: series design spec

Date: 2026-09-26

## Purpose

Start a reverse engineering series on 0x4142 that takes a reader from
"I can write C" to reading, debugging and cracking real x86-64 Linux
binaries. Readers must be able to *see* what the debugger shows at every
important step, both in the post itself and by running the same thing
themselves.

This spec covers three pieces:

1. The curriculum (what each part teaches).
2. Blog-side rendering of captured terminal sessions (a reusable
   `:::capture` directive and the capture file format).
3. The lab repo for this series (`reverse-engineering-lab`).

Writing the individual posts is not covered here beyond parts 0 and 1,
which are the first deliverables.

## Decisions already made

- **Audience:** can write and compile C; has never read assembly or used
  gdb.
- **Platform:** Linux, x86-64, ELF.
- **Debugger:** plain gdb for parts 2 to 5, then pwndbg from part 6 on.
  Part 6 maps each pwndbg panel back to the gdb commands readers already
  know.
- **Static analysis:** `objdump`/`readelf` first, Ghidra from part 9.
- **Visuals:** rendered captures in every post, plus a lab readers can
  run to reproduce every step.
- **Lab location:** one separate public repo per series. The user creates
  the GitHub repo; its contents are prepared locally first.
- **Blog/lab boundary:** the only shared thing is a documented capture
  file format owned by the blog. No shared code between lab repos.
- **Existing post:** `smashing-the-stack.md` stays at its current URL. A
  reworked version becomes part 12 and the two link to each other.

## Curriculum

The series is a blog series (existing subpost support):
`src/content/blog/reverse-engineering/index.md` is part 0, and each later part
is a sibling file ordered with `order`. URLs are
`/blog/reverse-engineering/<part-slug>`.

### Arc 1: Reading the machine (plain gdb + objdump)

| # | Part | Teaches | Tools introduced | Lab binary |
|---|------|---------|------------------|------------|
| 0 | Setting up the lab | Pulling or building the image, lab layout, how to read captures and steppers | `docker` | none |
| 1 | What your compiler actually made | C source to ELF: headers, sections, symbols, first disassembly | `gcc`, `file`, `readelf`, `objdump -d` | `hello` |
| 2 | Registers and your first instructions | x86-64 registers, `mov`/`add`/`sub`/`lea`, single-stepping | gdb: `break`, `run`, `stepi`, `info registers`, `disassemble` | `arith` |
| 3 | Memory and the stack | Addresses, little-endian, `push`/`pop`, `rsp` | gdb: `x/`, `display` | `locals` |
| 4 | Functions and calling conventions | `call`/`ret`, return addresses, prologue/epilogue, System V argument registers | gdb: `bt`, `finish`, `frame`, `info frame` | `calls` |
| 5 | Control flow: finding your `if` in assembly | Flags, `cmp`/`test`, conditional jumps, loops, `switch` jump tables | `objdump` alone | `branches` |

### Arc 2: Better tools, bigger programs (pwndbg + Ghidra)

| # | Part | Teaches | Tools introduced | Lab binary |
|---|------|---------|------------------|------------|
| 6 | Upgrading to pwndbg | Each context panel mapped to parts 2 to 5 commands | pwndbg: context, `telescope`, `vmmap`, `nearpc` | `calls` |
| 7 | Data in memory | Arrays, strings, structs, pointers; `.data`, `.bss`, `.rodata` | pwndbg: `hexdump`, `search` | `records` |
| 8 | Talking to libc | Dynamic linking, PLT/GOT, lazy binding of `printf` | pwndbg: `got`, `plt`; `ldd` | `greeter` |
| 9 | Ghidra: letting the decompiler help | Decompiler output checked against gdb, renaming, retyping structs | Ghidra | `records`, `greeter` |
| 10 | Your first crackme | Static and dynamic analysis together to recover a password | all of the above | `crackme01` |
| 11 | Real-world binaries: stripped and optimized | `-O2` output, inlining, no symbols, finding `main` | `strip`, Ghidra function ID | `crackme02` |

### Arc 3: Bridge to exploitation

| # | Part | Teaches | Lab binary |
|---|------|---------|------------|
| 12 | Smashing the stack | Reworked existing post using lab binaries and steppers | `ret2win` |
| 13+ | Mitigations, ROP, leaks | Later; out of scope for this spec | later |

### Stepper moments

Multi-frame captures are required at least for: part 3 (`push`/`pop`
moving `rsp`), part 4 (`call` and `ret` placing and consuming the return
address), part 5 (flags changing on `cmp`), part 8 (GOT entry before and
after the first `printf`), part 12 (overflow overwriting the saved return
address).

## Capture file format (owned by the blog)

Location in the blog: `src/captures/<series>/<part>/<scenario>.json`,
for example `src/captures/reverse-engineering/part-03/push-pop.json`.

```json
{
  "version": 1,
  "title": "push and pop moving rsp",
  "frames": [
    {
      "label": "before push rbp",
      "command": "stepi",
      "output": "<text, may contain ANSI SGR color codes>"
    }
  ]
}
```

- `version`: must be `1`. Lets the format change later without breaking
  old captures silently.
- `title`: shown as the block's caption.
- `frames`: at least one. `label` is a short description of the state,
  `command` is what was typed to reach it (shown as a prompt line),
  `output` is the raw terminal output.
- Output lines should be at most 80 columns. Lab repos are responsible
  for capturing at that width.

The format is described in the blog README and validated with a Zod
schema in `src/lib/capture.ts`.

## Blog side: the `:::capture` directive

Usage in Markdown:

```md
:::capture{src="reverse-engineering/part-03/push-pop"}
:::
```

Optional attribute `diff="off"` disables changed-line marking (for
captures from tools that already highlight changes themselves, such as
pwndbg).

### Behavior

- **One frame:** rendered as a single `ansi` code block. This replaces
  pasting transcripts by hand, so every terminal block in the series
  comes from the lab and can be regenerated.
- **Several frames:** rendered as a stepper. Each frame is an `ansi`
  code block rendered through the existing Expressive Code renderer
  (`src/lib/expressive-code`), so frames match every other code block.
  Controls: previous and next buttons, left and right arrow keys when the
  stepper has focus, and a "step N / M" counter. Each frame shows its
  `label` and the `command` that produced it.
- **Changed lines:** unless `diff="off"`, lines that differ from the
  previous frame are marked using Expressive Code's line markers.
- **No JavaScript:** all frames render stacked in order, each with its
  label, so the content is complete without the script.
- **Width:** frame blocks scroll horizontally instead of wrapping, since
  wrapping breaks column layouts such as pwndbg's context view.
- **Accessibility:** the counter is a live region; buttons have labels
  and are disabled at the ends.

### Implementation units

- `src/lib/capture.ts`: Zod schema, `loadCapture(src)` that resolves
  and validates the JSON, and a line-diff helper.
- `src/lib/capture-directive.ts`: satteri mdast plugin, modeled on
  `src/lib/callout.ts`, registered in `astro.config.ts`.
- `src/components/CaptureStepper.astro`: the stepper's client script and
  styles, included once in `src/pages/blog/[...id].astro`. It finds every
  stepper rendered by the directive and attaches behavior, the same way
  `SeriesReader.astro` enhances server-rendered markup. The directive
  itself only emits static HTML.

### Errors

A missing file, invalid JSON, a `version` other than `1`, or a schema
mismatch fails the build with a message naming the post, the `src`
value and the problem. A broken capture can never reach the live site.

### Testing

The repo has no test runner yet. Add Vitest as a dev dependency with a
`test` script in `package.json`.

- Unit tests for the schema, loader and line-diff helper, using fixture
  captures under `src/lib/__fixtures__/captures/` (valid one-frame, valid
  multi-frame, missing field, wrong version, empty frames).
- Plugin tests that run the directive on Markdown strings referencing
  those fixtures and check the emitted HTML: one-frame renders a plain
  code block, multi-frame renders a stepper with every frame present,
  and an invalid capture throws with the `src` value in the message.
- Manual check in the browser: stepper controls, keyboard, dark and
  light themes, phone width, JavaScript disabled.

## Lab repo: `reverse-engineering-lab`

Prepared locally at `~/workspace/reverse-engineering-lab` (a sibling of the
blog). The user creates the GitHub repo and pushes it.

```
reverse-engineering-lab/
  README.md           how to run the lab, how parts map to folders
  Dockerfile          pinned base image, gcc, gdb, pwndbg, binutils
  Makefile            `make` builds binaries; `make capture BLOG=...`
  src/part-01/hello.c
  src/part-02/arith.c
  ...
  captures/part-01/*.sh     non-debugger captures (readelf, objdump)
  captures/part-03/*.gdb    gdb scripts, one per scenario
  capture.sh                runs scenarios, writes capture JSON
  .github/workflows/image.yml   builds and publishes the image on tag
```

- **Reproducibility:** base image and tool versions are pinned. Build
  flags are fixed per part (`-O0 -fno-pie -no-pie -g` for arc 1, relaxed
  where a part is about optimization or stripping). Captures run inside
  the image with ASLR disabled (gdb's default), at 80 columns, with color
  forced on.
- **Capture flow:** `make capture BLOG=../0x4142` runs every scenario in
  the container and writes JSON into
  `$BLOG/src/captures/reverse-engineering/`. The captures are then committed
  in the blog repo. The blog build never needs Docker or the lab repo.
- **Drift check:** re-running `make capture` and checking `git diff` in
  the blog shows any output change after a toolchain update.
- **For readers:** `docker run -it ghcr.io/oceanman42/reverse-engineering-lab`
  or `docker build` from a clone. Part 0 documents both.

## Build order

1. Lab repo: Dockerfile, Makefile, `hello.c`, capture script producing
   part 1's one-frame captures.
2. Blog: capture schema, loader and `:::capture` directive with tests
   (one-frame case first, then the stepper).
3. Drafts of part 0 (`index.md`) and part 1, marked `draft: true`.
4. Later parts follow one at a time, each adding its binaries and
   scenarios to the lab first.

Part 1 needs only one-frame captures, so it can ship before the stepper
is finished.

## Out of scope

- Parts 13 and later (mitigations, ROP, leaks).
- Creating the GitHub repo, publishing the image, and deployment.
- Asciinema-style recordings.
- Interactive in-browser emulation of binaries.
