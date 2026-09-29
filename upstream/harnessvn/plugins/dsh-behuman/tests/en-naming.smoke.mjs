/**
 * Regression checks for the English build of this plugin.
 *
 * Two properties are load-bearing here and are easy to break silently:
 *
 * 1. **No CJK anywhere under `lib/`.** The harness titles every spawned
 *    child's session in the language of its messages, so one stray Chinese
 *    prompt turns a subagent's row in the UI into Chinese.
 * 2. **Every review subagent is named after its business.** `memory-review-t<turn>-<facet>`
 *    must be derivable from the reviewed window alone, never a constant.
 *
 * Run: `npm test` (or `node tests/en-naming.smoke.mjs`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReport } from '../lib/apply.js';
import { lastTurn, renderWindow, reviewFacet, reviewLabel, scanClues } from '../lib/clues.js';
import { MEMORY_RULES, TRUST_NOTE, renderReviewPrompt, renderSkillRules } from '../lib/prompt.js';
import { rejectSkillName } from '../lib/skills.js';
import { MemoryStore } from '../lib/store.js';

const LIB = fileURLToPath(new URL('../lib', import.meta.url));
/** CJK unified ideographs + compatibility ideographs. */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`ok ${checks} — ${label}`);
};

/** Every file under lib/, recursively. */
function libFiles(dir = LIB) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory())
            out.push(...libFiles(path));
        else
            out.push(path);
    }
    return out;
}

check('no CJK character survives anywhere under lib/', () => {
    const offenders = libFiles()
        .filter(path => CJK.test(readFileSync(path, 'utf8')))
        .map(path => path.slice(LIB.length + 1));
    assert.deepEqual(offenders, [], `CJK found in: ${offenders.join(', ')}`);
});

check('model-facing prompt blocks are English and non-empty', () => {
    for (const [name, text] of [
        ['MEMORY_RULES', MEMORY_RULES],
        ['TRUST_NOTE', TRUST_NOTE],
        ['renderSkillRules', renderSkillRules('/home/u/.agents/skills')],
        ['renderReviewPrompt', renderReviewPrompt('[user] hi', ['[complex-task] 7 tool calls'], ['existing-skill'])],
    ]) {
        assert.ok(text.length > 40, `${name} looks empty`);
        assert.ok(!CJK.test(text), `${name} still carries CJK`);
        assert.match(text, /[A-Za-z]{3}/, `${name} is not English text`);
    }
    assert.match(MEMORY_RULES, /# Memory/);
    assert.match(renderSkillRules('/x/.agents/skills'), /generated-by: dsh-behuman/);
});

check('review label encodes turn + business facet', () => {
    assert.equal(reviewLabel(3, 'complex-task'), 'memory-review-t3-complex-task');
    assert.equal(reviewLabel(12, 'repeat-error'), 'memory-review-t12-repeat-error');
    assert.equal(reviewLabel(undefined, 'general'), 'memory-review-general');
    for (const label of [reviewLabel(1, 'user-correction'), reviewLabel(9, 'decision')]) {
        assert.match(label, /^memory-review(-t\d+)?-[a-z]+(?:-[a-z]+)*$/);
    }
    assert.notEqual(reviewLabel(1, 'general'), reviewLabel(2, 'general'));
});

/** One committed user message. */
const userMessage = (seq, text) => ({ seq, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } });
/** One committed tool call. */
const toolCall = (seq, turn) => ({ seq, type: 'tool/call', data: { turn, name: 'bash' } });
/** One committed failing tool result. */
const toolResult = (seq, turn, text) => ({ seq, type: 'tool/result', data: { turn, isError: true, content: [{ type: 'text', text }] } });

check('Vietnamese user text fires the matching business facet', () => {
    const events = [
        userMessage(1, 'từ giờ luôn dùng pnpm trong workspace này nhé'),
    ];
    assert.deepEqual(scanClues(events, -1).map(clue => clue.tag), ['standing-preference']);
});

check('Vietnamese correction is detected', () => {
    const events = [userMessage(1, 'không đúng, sai rồi — làm lại đi')];
    assert.deepEqual(scanClues(events, -1).map(clue => clue.tag), ['user-correction']);
});

check('a repeated failure outranks the intent facets', () => {
    const events = [
        toolCall(1, 1),
        toolResult(2, 1, 'Error: ECONNREFUSED 127.0.0.1:9999'),
        toolCall(3, 2),
        toolResult(4, 2, 'Error: ECONNREFUSED 127.0.0.1:9999'),
        userMessage(5, 'chốt, làm theo cách này'),
    ];
    assert.equal(scanClues(events, -1)[0].tag, 'repeat-error');
});

check('turn number and facet come out of the same window', () => {
    const events = [
        userMessage(1, 'làm giúp tôi 6 việc'),
        ...[1, 2, 3, 4, 5, 6].flatMap((n) => [toolCall(n * 2 - 1, n), { seq: n * 2, type: 'tool/result', data: { turn: n, content: [{ type: 'text', text: 'ok' }] } }]),
    ];
    const since = -1;
    const clues = scanClues(events, since);
    assert.equal(lastTurn(events, since), 6);
    assert.equal(reviewFacet(clues), 'complex-task');
    assert.equal(reviewLabel(lastTurn(events, since), reviewFacet(clues)), 'memory-review-t6-complex-task');
});

check('rendered transcript markers are English', () => {
    const events = [
        userMessage(1, 'xin chào'),
        { seq: 2, type: 'assistant/message', data: { content: [{ type: 'text', text: 'chào bạn' }] } },
        toolCall(3, 1),
        toolResult(4, 1, 'boom'),
    ];
    const transcript = renderWindow(events, -1);
    for (const marker of ['[user]', '[assistant]', '[tool]', '[result-failed]'])
        assert.ok(transcript.includes(marker), `missing ${marker} in: ${transcript}`);
    assert.ok(!CJK.test(transcript));
});

check('skill-name rejections read as English reasons', () => {
    const reasons = ['fix-login-bug', 'pr-1234', 'x'.repeat(80)].map(name => rejectSkillName(name));
    for (const reason of reasons) {
        assert.ok(typeof reason === 'string' && reason.length > 0, 'expected a reason');
        assert.ok(!CJK.test(reason), `CJK in rejection reason: ${reason}`);
    }
    // A class-level name is accepted; the empty name falls back to the `memory`
    // slug, so it is the empty *body* check in `writeSkill` that rejects it.
    assert.equal(rejectSkillName('oauth2-flow'), undefined);
    assert.equal(rejectSkillName(''), undefined);
});

check('an empty store describes itself in English', () => {
    const dir = mkdtempSync(join(tmpdir(), 'behuman-en-'));
    try {
        const store = new MemoryStore(join(dir, '.dsh/memory'));
        store.ensureDirs();
        assert.ok(!CJK.test(store.renderCatalog()));
        assert.match(store.renderCatalog(), /No memories yet/);
        store.rebuildCatalog();
        assert.match(readFileSync(join(dir, '.dsh/memory/MEMORY.md'), 'utf8'), /^# Memory catalog/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

check('the full write path works and names an English label end to end', () => {
    const dir = mkdtempSync(join(tmpdir(), 'behuman-en-'));
    const logs = [];
    const logger = { info: m => logs.push(m), warn: m => logs.push(m) };
    try {
        const store = new MemoryStore(join(dir, '.dsh/memory'));
        const report = applyReport(logger, store, { skillsDir: join(dir, '.agents/skills') }, {
            memories: [{
                    title: 'User prefers short answers',
                    content: 'The user asked for concise replies.',
                    type: 'feedback',
                    description: 'User prefers concise replies',
                    why: 'They corrected a long answer.',
                    howToApply: 'Answer with the result first, details on request.',
                }],
            skills: [{ name: 'lfi-exploit', description: 'Use when exploiting a local file inclusion', content: 'Steps.' }],
            summary: 'recorded one memory and one skill',
        });
        assert.deepEqual({ memories: report.memories, skills: report.skills }, { memories: 1, skills: 1 });
        const written = readFileSync(join(dir, '.agents/skills/lfi-exploit/SKILL.md'), 'utf8');
        assert.match(written, /generated-by: dsh-behuman/);
        assert.ok(!CJK.test(written));
        assert.ok(!CJK.test(logs.join('\n')));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

console.log(`\n${checks} checks passed`);
