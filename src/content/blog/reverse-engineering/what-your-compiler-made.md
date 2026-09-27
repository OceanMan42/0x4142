---
title: "What Your Compiler Actually Made"
description: "Pulling apart the ELF file gcc builds from hello world: its header, sections, symbols, and a first look at main in assembly."
date: 2026-09-27
order: 1
authors:
  - "0x4142"
tags:
  - reverse-engineering
  - elf
  - objdump
draft: false
---

The smallest C program worth compiling produces a file of about 16 KB.
The source is five lines. So what's in the rest? This part answers that
with four tools (`file`, `readelf`, `nm` and `objdump`) and no assembly
knowledge at all. By the end you'll know where your code, your string and
your function names live inside the binary, and you'll have seen `main` as
the CPU sees it.

Everything here runs inside the lab image. If you haven't set it up yet,
[part 0](/blog/reverse-engineering) has the one command you need.

## The program

Here's the whole thing, in `part-01/hello.c`:

```c
#include <stdio.h>

int main(void) {
    printf("Hello, world!\n");
    return 0;
}
```

The lab builds it with these flags:

```bash
gcc -O0 -g -fno-pie -no-pie -o hello hello.c
```

- `-O0` turns optimization off, so the assembly follows the source line by
  line instead of being rearranged.
- `-g` adds debug information, which gdb will use from part 2 on.
- `-fno-pie -no-pie` builds a *position-dependent* executable: it always
  loads at the same address, so the addresses you see in these posts are
  the addresses you'll see in yours.

These flags make the first arc easier to follow. They're not how real
software ships, and part 11 drops them to see what optimized, stripped code
looks like.

## Four stages

"Compiling" is really four programs run back to back:

1. **Preprocess.** `cpp` pastes in `stdio.h` and expands macros. The
   output is still C.
2. **Compile.** `cc1` turns that C into assembly, a text file of
   instructions.
3. **Assemble.** `as` turns the assembly into machine code in an object
   file, `hello.o`.
4. **Link.** `ld` glues `hello.o` to the C runtime's startup code and
   records that `hello` needs the C library at runtime.

`gcc -S` stops after stage 2 and prints the assembly, which lets you see
the middle of the pipeline. Step through the frames:

:::capture{src="reverse-engineering/part-01/compile-stages" diff="off"}
:::

Don't try to read the assembly in frame 2 yet. Just notice that the string
`"Hello, world!"` and the name `main` are both still there as text. Frame 3
is the end of the pipeline: an actual executable.

## What is this file?

`file` looks at the first bytes of a file and tells you what it is:

:::capture{src="reverse-engineering/part-01/file"}
:::

That's one long line (scroll the block sideways), so here's what matters
in it:

- **ELF** is the *Executable and Linkable Format*, the file format Linux
  uses for executables, object files and shared libraries.
- **64-bit** and **x86-64**: built for 64-bit Intel and AMD processors.
- **LSB** stands for *least significant byte first*, also known as
  little-endian: multi-byte numbers are stored with their lowest byte
  first. This will matter a lot in part 3, when you read raw memory.
- **executable**, and not "pie executable", because of `-no-pie`.
- **dynamically linked**: `printf` isn't inside this file. It gets loaded
  from the C library when the program starts.
- **with debug_info, not stripped**: the file still carries the names of
  its functions and the debug info from `-g`. Binaries you download usually
  have both removed, and part 11 deals with that.

## The ELF header

Every ELF file starts with a 64-byte header that tells the operating system
how to load it. `readelf -h` prints it:

:::capture{src="reverse-engineering/part-01/elf-header"}
:::

Four lines are worth reading closely:

- **Magic.** The first four bytes are always `7f 45 4c 46`: the byte `0x7f`
  followed by the ASCII letters `E`, `L`, `F`. This is how `file` knew what
  it was looking at. The next two bytes are the class (`02`, 64-bit) and
  the data encoding (`01`, little-endian), which `readelf` spells out on
  the next two lines.
- **Type.** `EXEC`, a fixed-address executable. A PIE would say `DYN`.
- **Machine.** x86-64.
- **Entry point address.** `0x401050` is where the CPU starts executing.

That entry point is **not** `main`. Keep the number in mind for the
symbols section below: it belongs to a function you never wrote, which sets
up the process and then calls `main` for you.

## Sections

The linker arranges the file into *sections*, named chunks that each hold
one kind of thing. There are a lot of them:

:::capture{src="reverse-engineering/part-01/sections"}
:::

Thirty-six sections for a five-line program (entry `[ 0]` is an empty
placeholder that every ELF file has). Most are bookkeeping for the linker,
the loader and the debugger, and you can ignore them for now. Four are
worth knowing by name:

- **`.text`** holds the machine code. Its flags are `AX`: allocated in
  memory when the program runs, and executable. It starts at `0x401050`,
  the entry point from the header.
- **`.rodata`** holds read-only data, like string literals. It's at
  `0x402000` and only `0x12` (18) bytes long: 4 bytes the C runtime puts
  there, followed by `"Hello, world!"` and its terminating zero byte. So
  the string lives at `0x402004`. Remember that address.
- **`.data`** holds global variables that have an initial value. Flags
  `WA`: allocated and writable.
- **`.bss`** holds global variables that start out as zero. Its type is
  `NOBITS`: it takes no space in the file, and the loader just hands the
  program zeroed memory.

`hello.c` has no globals, yet `.data` and `.bss` aren't empty. That's the C
runtime's startup code again, which the linker added. Every
`.debug_*` section comes from `-g`.

## Symbols

A *symbol* is a name with an address attached. `nm` lists them:

:::capture{src="reverse-engineering/part-01/symbols"}
:::

The letter in the middle column is the symbol's type: `T` is code (usually
in `.text`; `_init` and `_fini` live in their own small code sections),
`D` is initialized data, `B` is `.bss`, `R` is read-only data. Lowercase
means the symbol is local to this file. Three lines are the point:

- **`0000000000401136 T main`**: your function, in `.text`, at `0x401136`.
- **`0000000000401050 T _start`**: the entry point from the ELF header.
  `_start` is the startup code that eventually calls `main`.
- **`U puts@GLIBC_2.2.5`**: `U` means *undefined*. The binary uses `puts`
  but doesn't contain it, and there's no address because it won't have one
  until the C library is loaded at runtime. Part 8 shows how that address
  gets filled in.

Wait: `puts`? The source calls `printf`. There's no `printf` anywhere in
the list. gcc noticed that `printf("Hello, world!\n")` has no format
specifiers and ends in a newline, and swapped it for the cheaper
`puts("Hello, world!")`, which adds the newline itself. That's even with
optimizations off. It's your first sign that a binary isn't a literal
translation of its source, and the compiler will take bigger liberties
than this once optimization is on.

## First look at assembly

Finally, `objdump -d` *disassembles* the machine code: it turns the bytes
in `.text` back into readable instructions. Here's `main`:

:::capture{src="reverse-engineering/part-01/disasm-main"}
:::

The empty "Disassembly of section" headers are `objdump` announcing
sections it skipped because we asked for `main` only. Each remaining line
is one instruction: its address, then the instruction itself.

You don't need to know what any of these instructions do yet. That's part
2. For now, look at the *shape*, and you can already match most of it to
things you've seen in this post:

- **`push rbp` / `mov rbp,rsp`** at the top and **`pop rbp`** at the
  bottom are the function's *prologue* and *epilogue*, setting up and
  tearing down its stack frame. Nearly every function at `-O0` starts and
  ends this way. (`endbr64` is a security marker for the CPU, and you can
  skip it.)
- **`mov edi,0x402004`** loads `0x402004`, the address of
  `"Hello, world!"` in `.rodata`, into a register.
- **`call 401040 <puts@plt>`** calls `puts`, which gets that address as its
  argument.
- **`mov eax,0x0`** is `return 0`: the return value goes in `eax`.
- **`ret`** returns to whoever called `main`: the C runtime code that
  `_start` hands off to.

Five lines of C, eight instructions, and you can already point at where
the string comes from and where the `0` goes.

## Recap and next

- gcc runs four stages (preprocess, compile, assemble, link) and produces
  an ELF file, whose header tells the OS how to load it and where to start.
- Code lives in `.text`, string literals in `.rodata`, globals in `.data`
  and `.bss`, and symbols tie names like `main` to addresses in them.
- The binary isn't a literal copy of your source: execution starts at
  `_start`, not `main`, and `printf` quietly became `puts`.

Next up, part 2 (*Registers and your first instructions*): we open gdb,
step through `main` one instruction at a time, and learn what `mov`, `rbp`
and `eax` actually are.
