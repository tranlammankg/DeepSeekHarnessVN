# dsh-behuman

English | [中文](README.zh.md)

Long-term memory and self-evolving skills for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## This build: English + business-named subagents

This is the local English build (`0.1.1`) of the plugin, kept in this workspace and linked into
the `web` and `headless` profiles. Two deliberate changes against `0.1.0`:

1. **No CJK left in the plugin's runtime strings.** The harness titles every spawned child's
   session in *the language of its messages*, so the Chinese review prompt made each background
   review subagent show up in the UI carrying a Chinese title. Every model-facing string
   (memory rules, skill rules, review prompt, `remember` tool copy, errors, transcript markers,
   catalogs, skill-name rejection reasons) is now English, and the transcript markers read
   `[user] / [assistant] / [tool] / [result]`.
2. **Every review subagent is named after its business.** The label used to be the constant
   `dsh-memory-review`, which made all review rows identical. It is now derived from the window
   under review: `memory-review-t<turn>-<facet>`, where `<facet>` is the highest-priority clue
   (`complex-task`, `repeat-error`, `user-correction`, `standing-preference`, `decision`,
   `confirmation`) or `general`. The clue phrase tables now cover Vietnamese and English, not
   only Chinese — so the scanner actually fires in this deployment's sessions.

```sh
npm test        # 14 checks: no CJK under lib/, label shape, clue facets, the full write path,
                # and the review dispatch contract (label + prompt language) against a stubbed harness
```

Install into a profile (the row lives in the package's own bundle patch):

```sh
dsh plugin --profile web add "/path/to/home/Desktop/ phát triển các tính năng thêm cho harness/dsh-behuman"
```

A host-side plugin change needs a profile restart to take effect; the package is linked rather
than tarballed, so editing `lib/*.js` here plus a restart is the whole edit loop.
`rollback/` holds the profile manifests this change replaced, plus the one-command way back.

## How it was verified

Static and integration (`npm test`):

- no CJK under `lib/`;
- `reviewLabel`/`reviewFacet`/`lastTurn` produce `memory-review-t6-complex-task` from a window;
- Vietnamese correction/standing-rule text fires the matching clue (it never did before);
- `reviewOnce` hands the harness a business label and a CJK-free prompt, and still writes only
  through the normal `remember`/`writeSkill` gate.

End to end, on an **isolated** `dsh web` (`DSH_HOME` pointed at a scratch dir, port 9996, our
plugin linked, `nudgeInterval: 2` so one short turn trips the pass; `tests/e2e/e2e-check.mjs`):

```
ok the conversation header shows a subagent            (screenshot: docs/subagent-header-en.png)
ok the rendered page carries no CJK
ok child is titled by turn + business facet — memory-review-t3-complex-task
ok child prompt is English
ok child session title carries no CJK — "You are reviewing the conversation"
ok old constant label is gone
PASS — 0 failed check(s)
```

The review pass also wrote real memories through the linked package
(`.dsh/memory/memories/*.md` plus the regenerated `MEMORY.md`), so the linked install exercises
the same write path as the interactive `remember` tool.

Note on the E2E: the subagent dropdown itself could not be opened by synthetic clicks in the
headless Chromium (the trigger did not react to `Input.dispatchMouseEvent`), so the script
asserts the header chip in the DOM and reads the label/title the harness recorded for the child
— which is exactly what the dropdown renders.

People who work together for a month know things about each other — what the other cares about,
what they have already ruled out. dsh does not: tell it your project uses PostgreSQL and it asks
again next session.

This plugin fills that gap.

## What it does

- **Remembers you.** Your preferences, your corrections, your project's state — carried across sessions.
- **Gets better on its own.** A working approach gets written down as a skill, so the next similar task starts already knowing.
- **Nothing to operate.** No commands to type, no memory to manage. Install it and it works.

## How it works

Two things run once it is installed.

### 1. While you are talking, the agent writes things down

It is already in the conversation, so noticing something worth keeping costs it nothing — it just
writes a file. No extra model call.

When it writes:

| A memory, when | A skill, when |
|---|---|
| you mention a preference, a habit, or a project convention | it finishes something involved (5+ tool calls) |
| you correct it and it then does it your way | it fixes a tricky error |
| it works out an environment fact worth keeping | it discovers a workflow worth reusing |

Both columns sit on one condition: **it has to have actually worked**. An error that is still
broken, or a correction it has not yet applied successfully, is not written down. A "method"
summarised from an unsolved problem usually does not survive being used the next time either.

One more rule: **write facts, not commands**. "The user prefers short answers" gets written;
"always answer briefly" does not. The second one gets re-read as an instruction in a later session
and can override what you actually want then.

### 2. When it did not write anything, it goes back and looks

Models forget. There is no way around that. So after **10 tool calls with nothing written**
(the count is configurable), it runs a review pass over that stretch of conversation to see what
was missed.

This is the only part of the plugin that costs an extra model call, and it only runs while you are
not working.

### Both writers go through the same checks

Whether it can be written at all, whether it duplicates something, what the file is called,
whether the catalog needs rebuilding — no step is skipped. The review pass gets no privileges.

### The whole flow

```
WRITE
  ├─ as you talk:  written on the spot
  └─ catch-up:     a later pass fills the gaps
        │
        ▼  same checks either way
STORE
  ├─ memories/     one .md per fact
  └─ skills/       one SKILL.md per class of task
        │
        ▼
RECALL
  └─ the catalog rides in the prompt; the agent opens a file when a line earns it
```

There is no retrieval. Nothing is searched and your question is never used as a query — the
catalog is simply part of the context, and opening a file is the agent's own call. So remembering
costs no extra time.

The catalog does take up room, though, and it keeps growing. One line per memory, in front of the
agent every turn. A few dozen is nothing; a few hundred is real money. That is the known ceiling
of this design — the way past it is a searchable index generated from these Markdown files, not a
database that replaces them.

### Two more things

- **Saying the same thing twice strengthens a memory.** When a new memory closely overlaps an existing one, it updates that one instead of adding a second. Something you keep bringing up is evidence that it matters.
- **Nothing is hidden from you.** Memories are ordinary Markdown files. Open them, read them, edit them, delete them.

## Install

`dsh` runs one profile at a time — a named set of plugins and settings that you choose when you
launch it. The ones that ship with dsh are `web`, `tui`, and `headless`. Install into the one you
actually launch with:

```bash
dsh plugin --profile web add @goodddgrades/dsh-behuman     # if you run `dsh web`
dsh plugin --profile tui add @goodddgrades/dsh-behuman     # if you run `dsh tui`
```

That is the whole install, and there is nothing to enable afterwards. The profile is created the
first time you use it, so this works even if you have never launched it before.

If you use more than one profile, install into each of them.

### Or hand it to your agent

If you are already in a dsh session, you do not have to type any of that:

> Install the dsh-behuman plugin — https://github.com/goodddGrades/dsh-behuman

Your agent can read that page and run the install itself.

Installing straight from GitHub builds the plugin on your machine, so dsh will stop and ask you to
authorize that once. It tells you exactly what to add — the build is this package's own `prepare`
script, and nothing runs it until you say so.

## Where your memories live

```
<your working directory>/.dsh/memory/
├── MEMORY.md          the catalog — one line per memory
└── memories/          the memories themselves, one Markdown file each
```

Plain text, yours to read and edit. Each project directory gets its own memory, so switching
projects switches what the agent remembers.

Skills are written to `.agents/skills/` — the same place hand-written skills live, in the format
dsh already reads.

Auto-written skills are marked. Each one carries this in its frontmatter:

```yaml
metadata:
  generated-by: dsh-behuman
```

So you can tell at a glance which skills the agent wrote and which ones you did. It updates its
own; it never touches yours — a hand-written skill in the way is a refusal, not an overwrite.

## Configuration

Every option has a default; you only need this if you want to change something.

| Option | Default | What it does |
|---|---|---|
| `dir` | `.dsh/memory` | Where memories are kept. |
| `skillsDir` | `.agents/skills` | Where skills are written. |
| `nudgeInterval` | `10` | Tool calls without a write before the agent double-checks itself. `0` turns that off. |
| `reviewBackend` | `spawn` | Subagent used for that double-check. Leave it alone. |
| `reviewTimeoutMs` | `60000` | How long that double-check may take. |
| `reviewMaxTokens` | `2048` | Its output limit. |

## License

MIT — see [LICENSE](LICENSE).
