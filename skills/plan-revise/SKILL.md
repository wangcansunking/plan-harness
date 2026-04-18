# plan-revise

Batch-dispatch pending revise-intent comments on a scenario's plan docs. Reads every `plans/<scenario>/.comments/*.jsonl`, collects comments with `intent: "revise"` and `reviseStatus: "pending"`, then for each one:

1. POSTs to `/api/comments/:scenario/:doc/:id/revise-dispatch` to flip the status to `dispatched`.
2. Dispatches a writer subagent with the anchor context (section, exact text, prefix / suffix) and the comment body as the change request.
3. Writes the subagent's output to `.comments/<doc>.proposals/<id>.diff` in the proposal format:
   ```
   REPLACE:
   <old exact text>
   WITH:
   <new replacement text>
   ```
4. Calls the server again to mark the proposal as `proposed` — the widget then shows a "Proposal ready" chip on the comment card.

The author reviews each proposal in the Proposal modal (Phase 9) and clicks **Accept** or **Reject**. Accept applies the replacement and auto-resolves the comment; reject keeps the doc untouched.

## When to Use

- User runs `/plan-revise <scenario>` after collecting several "Request update" comments.
- User runs `/plan-revise <scenario> <commentId>` to re-dispatch a single comment (e.g. after a failed run).
- User is in passive-mode (`reviseMode: "passive"` in `.comment-config.json`, the default) and wants to flush the queue.

Active-mode scenarios auto-dispatch on every revise-intent post, so `/plan-revise` is rarely needed there — but still works as a fallback.

## Prerequisites

- plan-harness MCP running (dashboard on `localhost:3847` by default).
- At least one `pending` revise-intent comment in the target scenario.
- A writable `plans/<scenario>/.comments/<doc>.proposals/` directory (the dispatcher creates it on first use).

## Workflow

### Step 1: resolve arguments

```
arguments = "<scenario> [commentId]"
```

- If no scenario is given, inspect `cwd` / manifest and default to the current working scenario. If ambiguous, ask.
- If a comment id is given, scope the run to that one comment.

### Step 2: list pending revises

Use the MCP tool `plan_list_pending_revises` (or read the JSONL directly) to collect every comment matching:

```json
{ "intent": "revise", "reviseStatus": "pending" }
```

across all docs in the scenario. For each, keep: `doc`, `id`, `body`, `anchor`, `author`, `createdAt`.

Display the list to the user in compact form:

```
3 pending revise requests in built-in-comment-ui:

  design              cmt_a1b2c3  "split anchor and section id in data model"  (alice, 3h ago)
  design              cmt_d4e5f6  "add SSE reconnect strategy"                   (alice, 40m ago)
  implementation-plan cmt_789012  "Phase 7 needs a pinned 'Needs reattachment' group"  (alice, 5m ago)

Dispatch all 3? [y/n]:
```

If the user types `n`, exit without changes.

### Step 3: dispatch + generate proposals

For each pending revise:

1. POST `http://localhost:<port>/api/comments/<scenario>/<doc>/<id>/revise-dispatch`. This flips the on-disk status to `dispatched`. (The server enforces host-only — this works on loopback.)
2. Read the current doc HTML (`plans/<scenario>/<doc>.html`).
3. Extract the anchored span (`anchor.exact` within the section identified by `anchor.sectionId`).
4. Dispatch a writer subagent with this prompt:
   ```
   You are the Writer. Rewrite exactly the following span of a plan doc per the change request.
   Preserve the surrounding HTML; only return the replacement text.

   Change request: <comment body>

   Current span:
   <anchor.exact>

   Return the new text (no preamble, no code fences).
   ```
5. Write the response to `plans/<scenario>/.comments/<doc>.proposals/<id>.diff` in the two-stanza format:
   ```
   REPLACE:
   <anchor.exact>
   WITH:
   <agent output>
   ```
6. POST `http://localhost:<port>/api/comments/<scenario>/<doc>/<id>/revise-accept` — NO, wait. The author still has to click Accept. The agent's job is to STAGE the proposal. So instead, write the proposal file and append a `revise` event with status=`proposed`:
   - The dispatcher module's `attachProposal` helper handles this (server-side). MCP exposes it as `plan_attach_proposal` (tool TBD in a follow-up — for now invoke via an internal call or direct JSONL append matching the format).

Print a per-comment line as it lands:

```
✓ design / cmt_a1b2c3 → proposal ready (12 lines changed)
```

### Step 4: summarize

```
Dispatched 3 of 3. Open any doc with /view to see the 'Proposal ready' chip;
click it to review and Accept / Reject.
```

### Step 5: errors

| Error                                | Resolution                                                                         |
|--------------------------------------|------------------------------------------------------------------------------------|
| Server returns 403                   | Script is not running on loopback. Use the MCP tool path instead of raw HTTP.     |
| Anchor.exact no longer in doc        | Warn the user; skip this comment; leave status as `pending` so it can be retried. |
| Subagent returns nothing / errors    | Append a `revise` event with status=`pending` (no-op); surface in the summary.    |
| Proposal file exists                 | Overwrite with the new output. The JSONL event audit trail preserves the history. |

## Sub-commands

| Invocation                         | Behavior                                             |
|------------------------------------|------------------------------------------------------|
| `/plan-revise <scenario>`          | Batch-dispatch every pending revise in the scenario. |
| `/plan-revise <scenario> <cmtId>`  | Dispatch only the specified comment.                 |
| `/plan-revise status <scenario>`   | Print the current queue without dispatching.         |
| `/plan-revise cancel <scenario> <cmtId>` | Mark a pending comment as rejected (cleanup).   |
