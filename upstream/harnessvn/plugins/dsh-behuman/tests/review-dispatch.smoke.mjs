/**
 * Integration check for the review dispatch path (`reviewOnce`).
 *
 * This is the one place the plugin hands work to the harness, and it decides
 * two things the user reads directly in the UI:
 *
 * - the child's **label** — must be the business name of this pass
 *   (`memory-review-t<turn>-<facet>`), never a constant;
 * - the child's **prompt** — must contain no CJK, because the harness titles
 *   the child's session in the language of its messages and the UI shows that
 *   title as the subagent's description line.
 *
 * The harness itself is stubbed: what is under test is our side of the
 * contract, so no model call and no server are involved.
 *
 * Run: `node tests/review-dispatch.smoke.mjs`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewOnce } from '../lib/review.js';
import { MemoryStore } from '../lib/store.js';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

let checks = 0;
const check = async (label, fn) => {
    await fn();
    checks++;
    console.log(`ok ${checks} — ${label}`);
};

/** One committed user message. */
const userMessage = (seq, text) => ({ seq, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } });
/** One committed tool call, tagged with the turn it belongs to. */
const toolCall = (seq, turn) => ({ seq, type: 'tool/call', data: { turn, name: 'bash' } });
/** One committed successful tool result. */
const toolResult = (seq, turn) => ({ seq, type: 'tool/result', data: { turn, content: [{ type: 'text', text: 'ok' }] } });

/** A window of `turns` turns with two tool calls each — enough to trip the counter. */
function busyWindow(turns) {
    const events = [userMessage(1, 'lam giup toi vai viec')];
    let seq = 2;
    for (let turn = 1; turn <= turns; turn++) {
        events.push(toolCall(seq++, turn));
        events.push(toolResult(seq++, turn));
        events.push(toolCall(seq++, turn));
        events.push(toolResult(seq++, turn));
    }
    return events;
}

/** A stubbed harness: a logger, and a `subagents.start` that records its request. */
function harness(events, structured) {
    const dispatched = [];
    const logs = [];
    const ctx = {
        logger: {
            info: (message) => logs.push(message),
            warn: (message) => logs.push(message),
        },
        subagents: {
            start: async (backend, options) => {
                dispatched.push({ backend, options });
                return {
                    result: Promise.resolve({ stopReason: 'completed', structured }),
                    dispose: async () => { },
                };
            },
        },
    };
    const agent = { session: { id: 'session-under-test', seq: events.at(-1).seq, snapshotEvents: () => events } };
    return { ctx, agent, dispatched, logs };
}

const settings = (skillsDir) => ({ interval: 10, backend: 'spawn', timeoutMs: 60_000, maxTokens: 2048, skillsDir });

await check('a busy turn dispatches one review named after turn + business facet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'behuman-dispatch-'));
    try {
        const events = busyWindow(6);
        const { ctx, agent, dispatched, logs } = harness(events, { memories: [], skills: [], summary: 'none' });
        const store = new MemoryStore(join(dir, '.dsh/memory'));
        const report = await reviewOnce(ctx, store, settings(join(dir, '.agents/skills')), agent);

        assert.equal(dispatched.length, 1, 'expected exactly one child');
        const { backend, options } = dispatched[0];
        assert.equal(backend, 'spawn');
        assert.equal(options.label, 'memory-review-t6-complex-task');
        assert.match(options.label, /^memory-review-t\d+-[a-z]+(?:-[a-z]+)*$/);
        assert.notEqual(options.label, 'dsh-memory-review', 'the old constant label must be gone');

        const prompt = options.prompt.map(block => block.text).join('\n');
        assert.ok(!CJK.test(prompt), 'the child prompt still carries CJK — its session title would be Chinese');
        assert.match(prompt, /reviewing the conversation below/i);
        assert.match(prompt, /\[tool\]/, 'the window travels with English transcript markers');
        assert.deepEqual(options.toolFilter, { allow: [] });
        assert.deepEqual({ memories: report?.memories, skills: report?.skills }, { memories: 0, skills: 0 });
        assert.ok(!CJK.test(logs.join('\n')), 'log lines must not carry CJK');
        assert.ok(logs.some(line => line.includes('memory-review-t6-complex-task')), 'the log names the pass');
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

await check('a quiet turn dispatches nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'behuman-quiet-'));
    try {
        const events = busyWindow(2);
        const { ctx, agent, dispatched } = harness(events, { memories: [], skills: [], summary: 'none' });
        const store = new MemoryStore(join(dir, '.dsh/memory'));
        const report = await reviewOnce(ctx, store, settings(join(dir, '.agents/skills')), agent);
        assert.equal(report, undefined);
        assert.equal(dispatched.length, 0);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

await check('whatever the reviewer proposes is written through the normal gate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'behuman-apply-'));
    try {
        const events = busyWindow(6);
        const { ctx, agent } = harness(events, {
            memories: [{
                    title: 'Deploy target is the LAN host',
                    content: 'The user deploys to 192.168.1.6.',
                    type: 'project',
                    description: 'Deploys to the LAN host',
                }],
            skills: [],
            summary: 'one memory',
        });
        const store = new MemoryStore(join(dir, '.dsh/memory'));
        const result = await reviewOnce(ctx, store, settings(join(dir, '.agents/skills')), agent);
        assert.deepEqual({ memories: result?.memories, skills: result?.skills }, { memories: 1, skills: 0 });
        assert.match(store.renderCatalog(), /Deploys to the LAN host/);
        assert.ok(!CJK.test(readFileSync(join(dir, '.dsh/memory/MEMORY.md'), 'utf8')));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

console.log(`\n${checks} checks passed`);
