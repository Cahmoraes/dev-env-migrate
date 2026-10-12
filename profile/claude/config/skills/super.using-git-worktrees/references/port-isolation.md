# Port Isolation Across Worktrees

A worktree isolates **files**, not the **runtime**. Two worktrees still share one loopback
interface, so the moment either one boots a dev server, a database container, a broker or a
Playwright `webServer`, they collide on the same hard-coded port and one fails with
`EADDRINUSE`. That failure arrives looking like a broken implementation, which is the
expensive part: it is indistinguishable from a real bug until someone reads the stack trace.

The fix is the one the platform world settled on years ago and that 12-factor calls *port
binding*: **the environment assigns the port, the application reads it.** A worktree is an
environment, so each worktree gets a block of ports exported as environment variables.

## The mechanism

```bash
node <super.using-git-worktrees-base-dir>/scripts/allocate-ports.cjs --worktree <path>
```

It is idempotent, it writes `<worktree>/.superpowers/ports.env`, and it prints JSON. The
verdict is in the JSON (`enabled`, `configured`, `conflicts`), never in the exit code.

| Flag | Use |
|---|---|
| *(none)* | Allocate or reuse this worktree's block; write the env file |
| `--detect` | Scan the repo and print a proposed `ports.yml` (never writes one) |
| `--check` | Audit live leases: mutually disjoint, and clear of canonical ports |
| `--list` | Show every live lease; reap leases of removed worktrees |
| `--release` | Give the block back — run before removing the worktree |

**No `.superpowers/ports.yml` → `enabled: false` and nothing happens.** A repo where nothing
binds a port needs no configuration and pays no cost.

## Configuration (`.superpowers/ports.yml`, in the consumer repo)

```yaml
range: 20000-32767      # optional; must sit below the OS ephemeral range
block_size: 16          # optional; must be >= the number of services
compose_project: true   # optional; also emit COMPOSE_PROJECT_NAME
services:
  frontend: 3000        # <name>: <canonical port, used by the main working tree>
  backend: 3333
  postgres: 5432
  rabbitmq: 5672
  rabbitmq_management: 15672
  redis: 6379
```

Each service becomes `<NAME>_PORT` in upper snake case (`rabbitmq_management` →
`RABBITMQ_MANAGEMENT_PORT`). **One slot per port**: a service publishing two ports is two
entries. Declaration order assigns slots, so service *i* of a block is always
`blockStart + i` — reordering the file moves every port.

Run `--detect` to draft this from what the repo already declares (Compose `ports:`, `PORT=`
and `*_PORT=` in env files, including one level of `apps/*` and `packages/*`). Detection
**proposes**; a human confirms and writes the file.

## What the numbers mean

- **The main working tree keeps the canonical ports.** Allocation applies to linked
  worktrees only, so an ordinary `git checkout` workflow is unchanged and the same env-var
  contract holds in both places.
- **The starting block is hashed from the worktree's branch name**, not from its position in
  `git worktree list`. A positional scheme renumbers every later worktree when an earlier one
  is removed, silently moving a running service's port.
- **Collisions are resolved by probing to the next block**, and a block is accepted only when
  every port in it is both unleased *and* actually bindable. Bookkeeping alone would hand out
  a port that the user's own `docker compose up` already holds.
- **Leases persist and are reused**, so a long-running container keeps its port across a
  resumed session. They live under the git common directory — shared by every worktree of the
  repo by construction, and never committed.
- **The default range 20000-32767 sits below the Linux ephemeral range** (typically
  32768-60999), so the kernel never hands a reserved port to an unrelated outbound socket. A
  range that overlaps it is warned about, not silently accepted.

## Consuming the ports

The generated file is a plain env file, so any of these work:

```bash
set -a; . .superpowers/ports.env; set +a   # export into the current shell
docker compose --env-file .superpowers/ports.env up -d
```

For the app itself, the adaptation belongs on the **consumer** side and is small — read the
variable instead of a literal:

```ts
const port = Number(process.env.BACKEND_PORT ?? 3333)   // canonical value as the fallback
```

Values that embed a port (DSNs, base URLs) compose from the same variables, which keeps this
skill out of the business of knowing any particular driver's URL grammar:

```bash
DATABASE_URL=postgresql://user:pass@localhost:${POSTGRES_PORT}/app
NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}
```

## Ports are not the only shared runtime resource

Isolating ports and stopping there leaves collisions that look identical to the user:

- **Docker Compose isolates by *project*, not by directory.** `COMPOSE_PROJECT_NAME` (emitted
  by default) gives each worktree its own containers, network and volumes. But an explicit
  `container_name:` in the Compose file **overrides the project name** and reintroduces the
  collision even when the ports differ — `--detect` warns about every occurrence. Remove
  those pins and let Compose derive names.
- **A shared database server** is one namespace no matter how many ports point at it. Either
  give each worktree its own container (the `COMPOSE_PROJECT_NAME` route) or derive the
  database/schema name from the same worktree identity.
- **Fixed-port test tooling** must read the variables too. Playwright's `webServer` and
  `baseURL` are the usual offenders; point them at `process.env.<NAME>_PORT`.
- **`node_modules` is not shared between worktrees** and a fresh worktree has none — which is
  why the skill's project-setup step runs before the baseline.

## Scope: this is a per-worktree mechanism

Blocks are allocated to **linked worktrees**. The sequential execution skill runs every task
in one working tree, so there is one set of ports — the canonical ones — and nothing to
allocate.

## Red flags

- Hard-coding a port anywhere inside a worktree, including in a test helper.
- Reading the port from `ports.env` **once** and pasting the number into a config file — the
  block can move when a lease is reclaimed; read the variable each run.
- Treating an allocation `conflicts` entry as a warning. It means no block was granted, so no
  env file was written; widen `range` or release stale leases first.
- Removing a worktree without `--release`. The lease survives until something reaps it, and
  the range is finite. (`--list` reaps leases of worktrees git no longer knows about, so this
  self-heals — but not before the next allocation may have skipped the range needlessly.)
