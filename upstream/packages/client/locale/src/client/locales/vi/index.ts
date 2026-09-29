/** Bang tu dien tieng Viet theo namespace - sinh tu dong. */
import { vi as agent_team } from './agent_team.ts'
import { vi as approval } from './approval.ts'
import { vi as chat } from './chat.ts'
import { vi as command } from './command.ts'
import { vi as common } from './common.ts'
import { vi as conversation } from './conversation.ts'
import { vi as cordis } from './cordis.ts'
import { vi as deliverables } from './deliverables.ts'
import { vi as documentHtml } from './documentHtml.ts'
import { vi as documentMarkdown } from './documentMarkdown.ts'
import { vi as documentPreview } from './documentPreview.ts'
import { vi as feedback } from './feedback.ts'
import { vi as goal } from './goal.ts'
import { vi as job } from './job.ts'
import { vi as model } from './model.ts'
import { vi as open_in_app } from './open_in_app.ts'
import { vi as plan } from './plan.ts'
import { vi as pluginManager } from './pluginManager.ts'
import { vi as question } from './question.ts'
import { vi as reference } from './reference.ts'
import { vi as schedule_catalog } from './schedule_catalog.ts'
import { vi as schedule_manager } from './schedule_manager.ts'
import { vi as session_log_download } from './session_log_download.ts'
import { vi as settings } from './settings.ts'
import { vi as settings_account } from './settings_account.ts'
import { vi as settings_agentLoop } from './settings_agentLoop.ts'
import { vi as settings_agentPreset } from './settings_agentPreset.ts'
import { vi as settings_locale } from './settings_locale.ts'
import { vi as settings_models } from './settings_models.ts'
import { vi as settings_permission } from './settings_permission.ts'
import { vi as settings_pluginInventory } from './settings_pluginInventory.ts'
import { vi as settings_plugins } from './settings_plugins.ts'
import { vi as settings_shell } from './settings_shell.ts'
import { vi as settings_subagent } from './settings_subagent.ts'
import { vi as settings_theme } from './settings_theme.ts'
import { vi as settings_webSearch } from './settings_webSearch.ts'
import { vi as shortcuts } from './shortcuts.ts'
import { vi as shortcuts_layout } from './shortcuts_layout.ts'
import { vi as sidebar } from './sidebar.ts'
import { vi as sidebarBrowser } from './sidebarBrowser.ts'
import { vi as sidebarCode } from './sidebarCode.ts'
import { vi as sidebarExcel } from './sidebarExcel.ts'
import { vi as sidebarFiles } from './sidebarFiles.ts'
import { vi as sidebarImage } from './sidebarImage.ts'
import { vi as sidebarOffice } from './sidebarOffice.ts'
import { vi as sidebarPdf } from './sidebarPdf.ts'
import { vi as sidebarRight } from './sidebarRight.ts'
import { vi as sidebarTerminal } from './sidebarTerminal.ts'
import { vi as skill } from './skill.ts'
import { vi as slash_menu } from './slash_menu.ts'
import { vi as subagent } from './subagent.ts'
import { vi as trajectory } from './trajectory.ts'
import { vi as voice_input } from './voice_input.ts'
import { vi as workflowRun } from './workflowRun.ts'
import { vi as workspace } from './workspace.ts'

/** Tu dien tieng Viet, khoa theo namespace cua runtime locale. */
export const VI_DICTIONARIES: Readonly<Record<string, Record<string, string>>> = {
  'agent-team': agent_team,
  'approval': approval,
  'chat': chat,
  'command': command,
  'common': common,
  'conversation': conversation,
  'cordis': cordis,
  'deliverables': deliverables,
  'documentHtml': documentHtml,
  'documentMarkdown': documentMarkdown,
  'documentPreview': documentPreview,
  'feedback': feedback,
  'goal': goal,
  'job': job,
  'model': model,
  'open-in-app': open_in_app,
  'plan': plan,
  'pluginManager': pluginManager,
  'question': question,
  'reference': reference,
  'schedule.catalog': schedule_catalog,
  'schedule.manager': schedule_manager,
  'session-log-download': session_log_download,
  'settings': settings,
  'settings.account': settings_account,
  'settings.agentLoop': settings_agentLoop,
  'settings.agentPreset': settings_agentPreset,
  'settings.locale': settings_locale,
  'settings.models': settings_models,
  'settings.permission': settings_permission,
  'settings.pluginInventory': settings_pluginInventory,
  'settings.plugins': settings_plugins,
  'settings.shell': settings_shell,
  'settings.subagent': settings_subagent,
  'settings.theme': settings_theme,
  'settings.webSearch': settings_webSearch,
  'shortcuts': shortcuts,
  'shortcuts.layout': shortcuts_layout,
  'sidebar': sidebar,
  'sidebarBrowser': sidebarBrowser,
  'sidebarCode': sidebarCode,
  'sidebarExcel': sidebarExcel,
  'sidebarFiles': sidebarFiles,
  'sidebarImage': sidebarImage,
  'sidebarOffice': sidebarOffice,
  'sidebarPdf': sidebarPdf,
  'sidebarRight': sidebarRight,
  'sidebarTerminal': sidebarTerminal,
  'skill': skill,
  'slash.menu': slash_menu,
  'subagent': subagent,
  'trajectory': trajectory,
  'voice-input': voice_input,
  'workflowRun': workflowRun,
  'workspace': workspace,
}
