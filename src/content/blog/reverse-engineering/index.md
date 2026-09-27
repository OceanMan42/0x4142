---
title: "Reverse Engineering"
description: "A series that starts from C you already know and ends with you reading, debugging and cracking real x86-64 binaries."
date: 2026-09-27
authors:
  - "0x4142"
tags:
  - reverse-engineering
  - gdb
  - x86-64
draft: false
---

You've written C. You've compiled it, run it, maybe chased a segfault or
two. But the file `gcc` hands back is a black box: you trust that it does
what your source says, and you've never had a reason to look inside. This
series opens the box. It starts with a five-line program you could write in
your sleep and ends with you pulling a password out of a binary you've never
seen the source for.

## Who this is for

You can write and compile C. You know what a pointer is, what a function
call is, and roughly what the stack is for. You have **never** read assembly
and you've never used gdb for anything beyond `bt` after a crash. That's the
whole prerequisite list. Every instruction, register and tool gets
introduced the first time it shows up, and not before.

## What you'll be able to do

The series is split into three arcs. Each one ends with a skill you can use
on its own.

### Arc 1: Reading the machine

Plain gdb and `objdump`, nothing fancy. You'll learn to read the assembly
your compiler produces for code you wrote yourself, so you always have the
source to check your reading against. By the end of the arc you can look at
a function's disassembly and say what it does, including its `if`s and
loops.

1. What your compiler actually made
2. Registers and your first instructions
3. Memory and the stack
4. Functions and calling conventions
5. Control flow: finding your `if` in assembly

### Arc 2: Better tools, bigger programs

Once you can do it by hand, you get to stop doing it by hand. pwndbg and
Ghidra take over the bookkeeping, and the programs get bigger: structs,
strings, calls into libc, and finally binaries with no source and no
symbols.

6. Upgrading to pwndbg
7. Data in memory
8. Talking to libc
9. Ghidra: letting the decompiler help
10. Your first crackme
11. Real-world binaries: stripped and optimized

### Arc 3: Bridge to exploitation

Everything from the first two arcs, pointed at a bug. This arc reworks
[*Smashing the Stack*](/blog/smashing-the-stack) on top of the lab, with
steppers showing the overflow one write at a time.

12. Smashing the stack

## Setting up the lab

Every binary and every terminal session in this series comes from one
Docker image. Pull it and drop into a shell:

```bash
docker run --rm -it ghcr.io/oceanman42/reverse-engineering-lab
```

Or build it yourself from the lab repo:

```bash
git clone https://github.com/OceanMan42/reverse-engineering-lab
cd reverse-engineering-lab
make shell
```

Inside the container you land in `/lab`. Each part has its own folder:
`part-01/` holds the source and the compiled binary for part 1, and so on.
The binaries are already built, so you can start poking at them right away.

The image pins its base system and toolchain (gcc, binutils, gdb) to exact
versions. That matters more than it sounds: two gcc releases can emit
different instructions for the same C, and addresses shift with them. With
the pinned image, the output you get is the output in the posts, byte for
byte.

## How to read this series

Terminal blocks in these posts aren't typed up by hand. They're recorded
from the lab image by a script, so they're exactly what the tools print.
A line starting with `$ ` is the command, which is what you type; everything
after it is output.

Some blocks have more than one frame. Those are steppers: the same terminal
at several moments in time, one frame at a time. Here's one that follows
`hello.c` from source to finished binary:

:::capture{src="reverse-engineering/part-01/compile-stages" diff="off"}
:::

Use **Next** and **Prev** to move between frames, or click the stepper and
use the left and right arrow keys. When a code block inside the stepper has
focus, the arrow keys scroll that block instead, so wide output stays
readable. In later parts, steppers highlight the lines that changed since
the previous frame, which is how you'll watch a register or a stack slot
change under a single instruction.

One convention to know up front: all assembly in this series uses **Intel
syntax** (`mov rbp, rsp`, destination first), not the AT&T syntax that some
tools default to (`mov %rsp,%rbp`). The lab's `objdump` and gdb commands are
set up for Intel everywhere.

## Next

Part 1, [*What Your Compiler Actually Made*](/blog/reverse-engineering/what-your-compiler-made),
takes the smallest C program there is and pulls apart the file gcc turns
it into.
