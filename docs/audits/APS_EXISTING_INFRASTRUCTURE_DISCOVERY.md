# APS existing infrastructure discovery — PR #159

Date: 2026-10-16. Implementation baseline: `2564921531105dacd072468ee2d44ed194441162`.

**Result: no suitable isolated Supabase-compatible recovery or hosted test target was found in the accessible locations and connected APS accounts inspected.** This is a bounded discovery result, not a claim about every possible remote machine or inaccessible directory. No software was installed, runtime started, database restored, resource created, production setting changed, or customer record modified during this discovery. Only audit documentation was added.

## What was inspected

| Area | Read-only evidence | Result |
|---|---|---|
| Running databases and containers | Process executable names, TCP listeners, Unix sockets, launch-service labels | No PostgreSQL, Docker, Podman, Colima, Lima, OrbStack, Supabase or QEMU service found. Existing Python frontend servers remain running. |
| Installed container runtimes | PATH; `/Applications`; user Applications; `/usr/local`; `/opt`; user/system launch directories; Homebrew installed formula list | No Docker, Podman, Colima, Lima, OrbStack or Rancher installation found. No runtime launch agent/daemon found. |
| Docker containers/images/volumes | Docker socket and known Docker Desktop VM/store paths; Docker contexts; Supabase local status | `/var/run/docker.sock`, `~/.docker`, Docker Desktop container/group-container directories and Docker VM disk images were not found. `supabase status` fails: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`. There is no reachable engine through which to enumerate stopped containers, images or volumes. This is not a successful empty `docker ps`/`docker images` result. |
| Alternative container stores | `~/.colima`, `~/.lima`, `~/.orbstack`, `~/.rd`, `~/.config/containers`, `~/.local/share/containers`, `~/.local/share/docker`, `/var/lib/docker`, `/var/lib/containers`; relevant Library directory names | None found. `DOCKER_HOST`, `DOCKER_CONFIG`, and `CONTAINER_HOST` are unset. No alternate Docker context metadata found. |
| PostgreSQL installations and clusters | `/Library/PostgreSQL`; Postgres.app locations; Homebrew prefixes/var directories; `/opt`; `/private/tmp`; project/document/download roots; `PG_VERSION`, `postgresql.conf`, executable and extension-file search | Found existing PostgreSQL 17.11 source-built clients and the embedded 17.10 server used by the current private-socket restore. Found no second cluster. No PostgreSQL Homebrew formula, Postgres.app, configured PG service file or PG environment target found. No matching Spotlight index result; filesystem search is the stronger evidence. |
| Extension files | Standard installation share/lib trees, existing embedded server extension directory, `/opt`, candidate configuration roots; extension `.control` and SQL filenames | Existing server has ordinary PostgreSQL extension controls but neither `pg_net` nor `supabase_vault`. No alternative installation supplying these files found. |
| Supabase CLI | Executable resolution, Homebrew formula inventory, version, cached npm executable pattern, user CLI configuration names | Existing `/usr/local/Cellar/supabase/2.101.0/bin/supabase`, linked from `/usr/local/bin/supabase`. No second npm CLI installation found in the checked cache pattern. User `.supabase` contains telemetry/traces, not an alternate local database configuration. |
| Project/environment files | Recursive filename discovery in Development, Documents, Desktop, Downloads, `.config`, `.local`, `.npm`, `.cache` and Codex worktrees; APS config/environment-file inspection | Six additional/current checkout configurations, plus the active worktree, all use function configuration rather than a configured local database stack. No APS `.env*`, Compose file or local database service definition found. PATC source/resources were excluded from reuse and modification. |
| Historical setup and Git | Setup/checklist files in older APS copies; current deployment docs; configuration history; Git paths for Compose, seed and common env files; historical commit `7c37ecd` | Old and current public/admin scripts use the same production Supabase hostname. No tracked Compose/local seed/common environment-file history found. The historical “Stable local backup before deployment” commit also points at production. |
| Shell startup/history | Runtime markers and command counts only, without exposing full history or credentials | Available zsh history: two Python HTTP server commands, seven Supabase link commands, zero `supabase start`, zero Docker run/Compose commands and zero pg_ctl/postgres launch commands. History is supporting evidence, not proof that a command was never run elsewhere. |
| Connected Supabase accounts | Connector projects/branches; independent CLI project list; read-only production catalog metadata | Connector exposes APS production only and zero APS branches. CLI sees two projects total; only one is APS. The unrelated project was not used or modified. APS has one non-template database, `postgres`; it is production. |
| Production extension configuration | Read-only `pg_extension` and server-version query; no table rows or secrets queried | PostgreSQL 17.6, `pg_net` 0.20.0, `supabase_vault` 0.3.1. These are present in production, not in an isolated target. |
| Vercel previews | Project metadata, undecrypted environment inventory for both APS Vercel projects, current PR checks, repository routing/frontend configuration | Both APS projects have an empty environment inventory. PR preview checks pass at baseline `2564921`. **CONFIRMED IN CODE:** public/admin JavaScript hardcodes production Supabase; static routing does not supply a separate preview backend. A preview URL therefore does not isolate database, Auth, Storage, functions or providers. |

## Newly located older APS copies

The following configurations were inspected in addition to the active worktree:

- `/Users/doneishawilson/Development/alignedprintscan-production`
- `/Users/doneishawilson/Documents/GitHub/alignedprintscan-production`
- `/Users/doneishawilson/Documents/Codex/2026-08-13/github-plugin-github-openai-curated-remote/work/alignedprintscan-production`
- `/Users/doneishawilson/Documents/Codex/2026-08-19/github-plugin-github-openai-curated-remote/alignedprintscan-production-release-1`
- `/Users/doneishawilson/Documents/Codex/2026-08-26/github-plugin-github-openai-curated-remote/work/repo`
- `/Users/doneishawilson/Downloads/Aligned Print & Scan/alignedprintscan-production-main`

**CONFIRMED IN CODE:** Every inspected public/admin backend reference is `sfsdniavqldgbiretply.supabase.co`. Every discovered APS `.temp/project-ref` identifies `sfsdniavqldgbiretply`. Config files contain Edge Function sections; no alternate database host or initialized local stack configuration was found.

## Why previous local development worked

**CONFIRMED IN DOCUMENTATION:** `docs/DEPLOYMENT_AND_TESTING.md` starts the static site with `python3 -m http.server 8000`. Older `FINAL_BUILD_SETUP_AND_TESTING.md` deploys functions explicitly to the production project and describes hosted SQL Editor, Stripe and email testing. That historical document is not current authorization to run its live-payment or deployment steps.

**CONFIRMED IN CODE:** The locally served browser application connects over HTTPS to hosted Supabase. This supports successful local frontend development and backend-connected operation without a local PostgreSQL or Supabase installation. Existing synthetic browser/PGlite and Deno tests also run without a full local Supabase stack. Neither arrangement proves that production can be fully restored locally.

The existing recovery scripts (`aps-create-backup.py`, `aps-restore-backup.py`, `aps-document-backup.py`, `aps-verify-restored-data.py`) reuse native PostgreSQL tools and the same `/private/tmp/aps-isolated-restore` target. No second recovery target was found in those scripts. They remain available and were not rerun destructively. The prior 123-table/2,436-row verification and 11 full-restore errors remain valid evidence; row matching is not full recovery.

## Search limits

- `/Users/doneishawilson/Documents/Library` is root-owned and returned permission denied both inside and outside the sandbox. Its contents were not inspected; no permissions were changed.
- Only `Macintosh HD` was mounted. Disconnected disks, other Macs, accounts not connected to these tools, and unconfigured remote container/database hosts cannot be ruled out.
- Standard package/dependency trees were pruned during broad configuration discovery; the known database installation and common executable/extension/cache locations were inspected separately. No secret values, private customer rows, Vault plaintext or full shell history were collected for this report.

## Smallest safe solution

There is no complete recovery path using only the resources identified under the current no-install/no-new-resource constraints. Merely starting the known native server again cannot supply missing extension binaries or the associated Supabase services and Vault recovery prerequisites.

If an existing compatible APS host is available outside this discovery scope, the smallest change is to connect that host and verify its isolation/disposable status before using it. No second paid service is inherently required.

If no such host exists, the missing local capability is a supported container runtime plus compatible Supabase images, reusing the already installed CLI, APS source, backup and test tools in a separate disposable directory. This would require an explicitly authorized installation/download step, which was **not performed or requested** here. Supabase documents the local stack's container-runtime requirement in its [official CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started). A local container stack would still need actual restore/integrity verification and an appropriate Vault recovery procedure; it is not an automatic recovery pass. Preview workflow testing would additionally require a verified isolated backend binding and controlled Auth/Storage/Stripe-test/Resend configuration.

## Preserved release status

| Gate | Status |
|---|---|
| Full isolated recovery | **BLOCKED** — no compatible isolated target found; missing extensions remain |
| Hosted end-to-end lifecycle | **BLOCKED** — existing preview uses production backend |
| Financial-history conversion | **FAILED / incomplete implementation** — discovery does not resolve the conversion lifecycle; preservation checks remain intact |
| Existing regression evidence | **PASSED, preserved** — 592 Node, 201 Deno, eight entrypoint checks, 12 customer browser cases and Operations Portal synthetic audit |
| Merge/production release | **BLOCKED** — PR #159 remains draft and unmerged |

Application, migration and test files were compared with `2564921` and are unchanged. Existing test logs were inspected, not overwritten or relabeled as hosted verification. No unchanged suite was rerun merely to repeat existing evidence. See [the release report](APS_NEIGHBORHOOD_UNIFIED_RELEASE.md) for the complete workflow matrix and unresolved engineering work.
