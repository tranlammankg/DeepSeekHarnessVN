#!/usr/bin/env python3
"""Ghep ban dich tieng Viet vao workbook va kiem tra chat luong.

Workbook duoc khoa theo (source_file, key) — dung mo hinh cua runtime (moi file
tu dien la mot namespace rieng). Ban dich duoc viet theo (package, key); voi
nhung key trung ten o nhieu file trong cung package, OVERRIDES cho ban dich rieng.
"""
import csv, os, re

WORKBOOK = 'planning/key-inventory.tsv'
OUT = 'planning/key-inventory-vi.tsv'

PKG_OF_FILE = {
    'planning/vi-b1-chat.txt': 'ui-chat',
    'planning/vi-b1-conv-a.txt': 'ui-conversation',
    'planning/vi-b1-conv-b.txt': 'ui-conversation',
    'planning/vi-b2-general.txt': 'ui-settings-general',
    'planning/vi-b2-models.txt': 'ui-settings-models',
    'planning/vi-b2-account.txt': 'ui-settings-account',
    'planning/vi-b2-websearch.txt': 'ui-settings-web-search',
    'planning/vi-b2-shell.txt': 'ui-settings-shell',
    'planning/vi-b2-subagent.txt': 'ui-settings-subagent',
    'planning/vi-b2-preset.txt': 'ui-agent-preset',
    'planning/vi-b3-desktop.txt': 'src',
    'planning/vi-b2-goal.txt': 'ui-goal',
    'planning/vi-b2-plan.txt': 'ui-plan',
    'planning/vi-b2-approval.txt': 'ui-approval',
    'planning/vi-b2-permission.txt': 'ui-permission-presets',
    'planning/vi-b2-questions.txt': 'ui-user-questions',
    'planning/vi-b2-skill.txt': 'ui-skill',
    'planning/vi-b2-inputtrigger.txt': 'ui-input-trigger',
    'planning/vi-b2-builtin.txt': 'ui-settings-plugins',
    'planning/vi-b2-jobs.txt': 'ui-jobs',
    'planning/vi-b2-modelselect.txt': 'ui-model-selection',
    'planning/vi-b2-feedback.txt': 'ui-message-feedback',
    'planning/vi-b2-pluginmgr-a.txt': 'ui-plugin-manager',
    'planning/vi-b2-pluginmgr-b.txt': 'ui-plugin-manager',
    'planning/vi-b4-openinapp.txt': 'ui-open-in-app',
    'planning/vi-b4-layout.txt': 'ui-layout',
    'planning/vi-b4-reference.txt': 'ui-reference',
    'planning/vi-b4-deliverables.txt': 'ui-deliverables',
    'planning/vi-b4-terminal.txt': 'ui-sidebar-terminal',
    'planning/vi-b4-browser.txt': 'ui-sidebar-browser',
    'planning/vi-b4-docpreview.txt': 'ui-sidebar-documentpreview',
    'planning/vi-b4-schedule-a.txt': 'ui-schedule',
    'planning/vi-b4-schedule-b.txt': 'ui-schedule',
    'planning/vi-b4-plugininv.txt': 'ui-settings-plugin-inventory',
    'planning/vi-b4-agentloop.txt': 'ui-settings-agent-loop',
    'planning/vi-b4-workflowrun.txt': 'ui-workflow-run',
    'planning/vi-b4-subagent.txt': 'ui-subagent',
    'planning/vi-b4-agentteam.txt': 'client-ui-agent-team',
    'planning/vi-b4-logexport.txt': 'session-log-export',
    'planning/vi-b4-locale-en.txt': 'locale',
    'planning/vi-b4-locale-settings.txt': 'locale',
    'planning/vi-b4-cordis.txt': 'ui-cordis',
    'planning/vi-b4-voice.txt': 'client-ui-voice-input',
    'planning/vi-b4-trajectory-a.txt': 'ui-trajectory',
    'planning/vi-b4-trajectory-b.txt': 'ui-trajectory',
}
PREFIXED_FILES = ['planning/vi-b0-a.txt', 'planning/vi-b0-b.txt']
PLAIN_FILES = list(PKG_OF_FILE)

DP = 'packages/client/ui-sidebar-documentpreview/src/client/'
SCH = 'packages/client/ui-schedule/src/client/'
OVERRIDES = {
    (DP + 'code/locales.ts', 'title'): 'Mã',
    (DP + 'excel/locales.ts', 'title'): 'Bảng tính',
    (DP + 'html/locales.ts', 'title'): 'HTML',
    (DP + 'image/locales.ts', 'title'): 'Ảnh',
    (DP + 'office/locales.ts', 'title'): 'Tài liệu Office',
    (DP + 'pdf/locales.ts', 'title'): 'PDF',
    (DP + 'html/locales.ts', 'failed'): 'Không xem trước được tài liệu HTML này.',
    (DP + 'image/locales.ts', 'failed'): 'Không hiển thị được ảnh này.',
    (DP + 'office/locales.ts', 'failed'): 'Chuyển đổi Office không tạo ra PDF dùng được. Hãy kiểm tra tệp rồi thử lại.',
    (DP + 'pdf/locales.ts', 'failed'): 'Không hiện được PDF: {message}',
    (DP + 'excel/locales.ts', 'invalid'): 'Không mở được bảng tính này. Hãy kiểm tra định dạng, nội dung hoặc mật khẩu.',
    (DP + 'office/locales.ts', 'invalid'): 'Không xem trước được tệp Office này. Có thể tệp bị hỏng, có mật khẩu, hoặc sai phần mở rộng.',
    (DP + 'excel/locales.ts', 'tooLarge'): 'Bảng tính này vượt giới hạn dung lượng xem trước.',
    (DP + 'office/locales.ts', 'tooLarge'): 'Tệp Office hoặc PDF đã chuyển đổi vượt giới hạn xem trước. Hãy giảm dung lượng tệp hoặc chỉnh cấu hình xem trước.',
    (DP + 'excel/locales.ts', 'timeout'): 'Mở bảng tính này quá thời gian chờ. Hãy thử tệp nhỏ hơn.',
    (DP + 'office/locales.ts', 'timeout'): 'Chuyển đổi Office quá thời gian chờ. Hãy thử lại.',
    (DP + 'image/locales.ts', 'unsupported'): 'Xem trước ảnh cần toàn bộ nội dung tệp.',
    (DP + 'pdf/locales.ts', 'unsupported'): 'Xem trước PDF cần toàn bộ nội dung tệp.',
    (DP + 'locales.ts', 'changed'): 'Tệp đã thay đổi, đang hiển thị nội dung trước đó.',
    (DP + 'office/locales.ts', 'changed'): 'Tệp đã thay đổi trong lúc đọc. Hãy mở lại bản xem trước.',
    (SCH + 'task-manager-locales.ts', 'list.loading'): 'Đang tải việc…',
    (SCH + 'task-manager-locales.ts', 'list.error'): 'Không tải được việc.',
    (SCH + 'task-manager-locales.ts', 'delete.action'): 'Xoá việc',
}

def load_en():
    rows = []
    with open(WORKBOOK, encoding='utf-8') as f:
        for r in csv.DictReader(f, delimiter=chr(9)):
            rows.append((r['source_file'], r['key'], r['en'], r['package'].split('/')[-1]))
    return rows

def load_vi():
    vi = {}
    for path in PREFIXED_FILES:
        if not os.path.exists(path):
            continue
        for line in open(path, encoding='utf-8'):
            line = line.rstrip(chr(10))
            if not line.strip():
                continue
            p, k, v = line.split('|', 2)
            vi[(p, k)] = v
    for path in PLAIN_FILES:
        if not os.path.exists(path):
            continue
        pkg = PKG_OF_FILE[path]
        for line in open(path, encoding='utf-8'):
            line = line.rstrip(chr(10))
            if not line.strip():
                continue
            k, v = line.split('|', 1)
            vi[(pkg, k)] = v
    return vi

ph = re.compile(r'\{([A-Za-z0-9_]+)\}')
rows = load_en()
vi = load_vi()
known = {(p, k) for _, k, _, p in rows}
bad_ph, same, empty, missing, extra, na = [], [], [], [], [], []
out_rows = []
for (sf, k, e, p) in rows:
    if not e.strip():
        # File nguon zh (khong co ban EN) — khong can ban dich vi rieng trong file nay
        na.append((p, sf))
        out_rows.append((p, sf, k, e, ''))
        continue
    v = OVERRIDES.get((sf, k))
    if v is None:
        v = vi.get((p, k))
    if v is None:
        missing.append((p, k))
        out_rows.append((p, sf, k, e, ''))
        continue
    if not v.strip():
        empty.append((p, k))
    if set(ph.findall(e)) != set(ph.findall(v)):
        bad_ph.append((p, k, e, v))
    if v.strip() == e.strip():
        same.append((p, k))
    out_rows.append((p, sf, k, e, v))
for key in vi:
    if key not in known:
        extra.append(key)
done = len(rows) - len(missing) - len(na)
print('workbook        : %d dong (source_file,key)' % len(rows))
print('da dich         : %d  (%.1f%%)' % (done, 100.0 * done / len(rows)))
print('chua dich       : %d' % len(missing))
print('khong co ban EN : %d  (file zh.ts — khong can dich rieng)' % len(na))
print('placeholder lech: %d | vi == en: %d | rong: %d | khoa thua: %d' % (len(bad_ph), len(same), len(empty), len(extra)))
for p, k, e, v in bad_ph[:10]:
    print('   LECH', p, k, '|', e, '|', v)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(chr(9).join(['package', 'source_file', 'key', 'en', 'vi']) + chr(10))
    for (p, sf, k, e, v) in out_rows:
        f.write(chr(9).join([p, sf, k, e.replace(chr(9), ' '), v.replace(chr(9), ' ')]) + chr(10))
print('da ghi', OUT)
