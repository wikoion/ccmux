/**
 * `bun test` preload (bunfig.toml): no test may reach the developer's own tmux
 * server. A test that left out its seam once ran a real `kill-pane`, and others
 * read whatever the developer's `%1` showed, so every tmux a test starts is
 * swapped for a stand-in that always fails. Tests that need tmux output stub
 * `Bun.spawn` or inject the module's seam instead.
 *
 * The swap wraps `Bun.spawn`/`Bun.spawnSync`, the only ways ccmux runs tmux,
 * because Bun resolves a command against the PATH it started with: editing
 * `process.env.PATH` here does not redirect a bare `tmux`. A test that stubs
 * `Bun.spawn` replaces the wrapper and sees its argv untouched.
 */
import { basename, join } from "path";

const STAND_IN = join(import.meta.dir, "test-bin", "tmux");

/** `cmd` with a `tmux` binary (bare or absolute) swapped for the stand-in. */
function guard(cmd: unknown): unknown {
  if (!Array.isArray(cmd) || typeof cmd[0] !== "string") return cmd;
  return basename(cmd[0]) === "tmux" ? [STAND_IN, ...cmd.slice(1)] : cmd;
}

/** Wrap `Bun.spawn`/`Bun.spawnSync`. Both are overloaded (an argv array, or
 *  an options object carrying `cmd`), so the call goes through `unknown`. */
function wrap<F>(real: F): F {
  const call = real as unknown as (...args: unknown[]) => unknown;
  return ((first: unknown, ...rest: unknown[]) => {
    const swapped =
      first && typeof first === "object" && "cmd" in first
        ? { ...first, cmd: guard(first.cmd) }
        : guard(first);
    return call(swapped, ...rest);
  }) as unknown as F;
}

Bun.spawn = wrap(Bun.spawn);
Bun.spawnSync = wrap(Bun.spawnSync);
