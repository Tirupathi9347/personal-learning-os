'use client';

import { useState, useEffect } from 'react';
import { ApiKeyPublicConfig } from '@/types';
import { getVaultConfig, saveGeminiKey, testVaultKey } from '@/app/actions/vault-actions';
import { getGitHubVaultConfig, saveGitHubToken, testGitHubConnection } from '@/app/actions/github-actions';
import { getLeetCodeVaultConfig, saveLeetCodeConfig, testLeetCodeConnection } from '@/app/actions/leetcode-actions';
import { generateSystemBackupZip } from '@/app/actions/backup-actions';
import { getStudentLearningHistoryStats, seedStudentLearningHistory, clearDemoLearningHistory, ExistingHistoryStats } from '@/app/actions/seed-learning-history-actions';
import { useTheme } from '@/components/theme/theme-provider';
import { Key, ShieldCheck, Save, Activity, Loader2, CheckCircle2, AlertCircle, Sparkles, FolderGit2, Code2, Download, Archive, Sun, Moon, Monitor } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const SUPPORTED_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Recommended - Active & Fast)' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (High Quota)' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest' },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [vaultConfig, setVaultConfig] = useState<ApiKeyPublicConfig | null>(null);
  const [githubConfig, setGithubConfig] = useState<ApiKeyPublicConfig | null>(null);
  const [leetcodeConfig, setLeetcodeConfig] = useState<(ApiKeyPublicConfig & { username?: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Gemini Form state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // GitHub Form state
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [isSavingGh, setIsSavingGh] = useState(false);
  const [isTestingGh, setIsTestingGh] = useState(false);
  const [ghMessage, setGhMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // LeetCode Form state
  const [leetcodeUsernameInput, setLeetcodeUsernameInput] = useState('');
  const [isSavingLc, setIsSavingLc] = useState(false);
  const [isTestingLc, setIsTestingLc] = useState(false);
  const [lcMessage, setLcMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup state
  const [isExporting, setIsExporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Learning History Seed state
  const [historyStats, setHistoryStats] = useState<ExistingHistoryStats | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [seedMessage, setSeedMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfigs = async () => {
    setIsLoading(true);
    const [gemini, gh, lc, stats] = await Promise.all([
      getVaultConfig(),
      getGitHubVaultConfig(),
      getLeetCodeVaultConfig(),
      getStudentLearningHistoryStats(),
    ]);
    setVaultConfig(gemini);
    setGithubConfig(gh);
    setLeetcodeConfig(lc);
    setHistoryStats(stats);
    if (gemini?.selected_model) {
      setSelectedModel(gemini.selected_model);
    }
    if (lc?.username) {
      setLeetcodeUsernameInput(lc.username);
    }
    setIsLoading(false);
  };

  const handleSeedHistory = async () => {
    setIsSeeding(true);
    setSeedMessage(null);
    try {
      const res = await seedStudentLearningHistory();
      if (res.success) {
        setSeedMessage({ type: 'success', text: res.message });
        const stats = await getStudentLearningHistoryStats();
        setHistoryStats(stats);
      } else {
        setSeedMessage({ type: 'error', text: 'Failed to seed learning history.' });
      }
    } catch (err: any) {
      setSeedMessage({ type: 'error', text: err.message || 'Error executing history seed.' });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear the seeded demo learning history? This will remove ONLY demo records and will never touch your genuine personal data or GitHub/LeetCode integration.')) {
      return;
    }
    setIsClearing(true);
    setSeedMessage(null);
    try {
      const res = await clearDemoLearningHistory();
      if (res.success) {
        setSeedMessage({ type: 'success', text: res.message });
        const stats = await getStudentLearningHistoryStats();
        setHistoryStats(stats);
      } else {
        setSeedMessage({ type: 'error', text: 'Failed to clear demo history.' });
      }
    } catch (err: any) {
      setSeedMessage({ type: 'error', text: err.message || 'Error clearing demo history.' });
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setMessage(null);

    const res = await saveGeminiKey(apiKeyInput.trim() || undefined, selectedModel);
    setIsSaving(false);

    if (res.success) {
      setApiKeyInput('');
      setMessage({ type: 'success', text: `Gemini AI configuration updated! Model set to: ${selectedModel}` });
      fetchConfigs();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to save configuration.' });
    }
  };

  const handleSaveGitHubToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubTokenInput.trim() || isSavingGh) return;

    setIsSavingGh(true);
    setGhMessage(null);

    const res = await saveGitHubToken(githubTokenInput.trim());
    setIsSavingGh(false);

    if (res.success) {
      setGithubTokenInput('');
      setGhMessage({ type: 'success', text: 'GitHub Personal Access Token encrypted & saved to Vault!' });
      fetchConfigs();
    } else {
      setGhMessage({ type: 'error', text: res.error || 'Failed to save GitHub token.' });
    }
  };

  const handleSaveLeetCodeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leetcodeUsernameInput.trim() || isSavingLc) return;

    setIsSavingLc(true);
    setLcMessage(null);

    const res = await saveLeetCodeConfig(leetcodeUsernameInput.trim());
    setIsSavingLc(false);

    if (res.success) {
      setLcMessage({ type: 'success', text: 'LeetCode handle encrypted & saved to Vault!' });
      fetchConfigs();
    } else {
      setLcMessage({ type: 'error', text: res.error || 'Failed to save LeetCode config.' });
    }
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setMessage(null);

    const res = await testVaultKey();
    setIsTesting(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message });
      fetchConfigs();
    } else {
      setMessage({ type: 'error', text: res.message });
    }
  };

  const handleTestGitHub = async () => {
    setIsTestingGh(true);
    setGhMessage(null);

    const res = await testGitHubConnection();
    setIsTestingGh(false);

    if (res.success) {
      setGhMessage({ type: 'success', text: res.message });
      fetchConfigs();
    } else {
      setGhMessage({ type: 'error', text: res.message });
    }
  };

  const handleTestLeetCode = async () => {
    setIsTestingLc(true);
    setLcMessage(null);

    const res = await testLeetCodeConnection();
    setIsTestingLc(false);

    if (res.success) {
      setLcMessage({ type: 'success', text: res.message });
      fetchConfigs();
    } else {
      setLcMessage({ type: 'error', text: res.message });
    }
  };

  const handleDownloadBackup = async () => {
    setIsExporting(true);
    setBackupMessage(null);

    const res = await generateSystemBackupZip();
    setIsExporting(false);

    if (res.success && res.base64Zip && res.filename) {
      const byteCharacters = atob(res.base64Zip);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const counts = res.itemCounts;
      const countSummary = counts
        ? `${counts.notes} notes, ${counts.journals} journals, ${counts.tasks} tasks, ${counts.projects} projects, ${counts.skills} skills, ${counts.mistakes} mistakes, ${counts.timeSessions} time sessions.`
        : 'All records packed.';

      setBackupMessage({
        type: 'success',
        text: `System Backup downloaded successfully! Included: ${countSummary}`,
      });
    } else {
      setBackupMessage({ type: 'error', text: res.error || 'Failed to generate system backup.' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl">
      <PageHeader
        icon={<Key className="w-5 h-5 text-[#0284C7]" />}
        title="API Key Vault & System Settings"
        description="Securely manage API keys, handles, and 1-click system backup exports."
      />

      {/* Security Guarantee Notice */}
      <GlassCard className="p-4 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 flex items-start gap-3 text-xs text-sky-900 dark:text-sky-200">
        <ShieldCheck className="w-5 h-5 text-[#0284C7] dark:text-sky-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-mono font-bold text-sky-950 dark:text-sky-100 uppercase tracking-wider">Zero-Leak Encryption Policy:</span>
          <p className="text-sky-900 dark:text-sky-200 mt-0.5 font-sans">
            Your API keys and OAuth tokens are encrypted at rest using AES-256-GCM. Decryption occurs strictly inside Node.js server memory. Plaintext secrets are NEVER exposed or included in system backups.
          </p>
        </div>
      </GlassCard>

      {/* System Theme Preferences Card */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--exec-border)] pb-3">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-[var(--exec-text)]">
            <Sun className="w-4 h-4 text-amber-500" />
            <h3>Appearance & System Theme</h3>
          </div>
          <Badge variant="cyan">EXECUTIVE UI</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
              theme === 'light'
                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-900 dark:text-sky-200 font-bold shadow-xs'
                : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] text-[var(--exec-text-muted)] hover:border-[var(--exec-border-hover)]'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-500" />
            <span>Executive Light</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
              theme === 'dark'
                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-900 dark:text-sky-200 font-bold shadow-xs'
                : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] text-[var(--exec-text-muted)] hover:border-[var(--exec-border-hover)]'
            }`}
          >
            <Moon className="w-5 h-5 text-sky-400" />
            <span>Executive Dark</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
              theme === 'system'
                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-900 dark:text-sky-200 font-bold shadow-xs'
                : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] text-[var(--exec-text-muted)] hover:border-[var(--exec-border-hover)]'
            }`}
          >
            <Monitor className="w-5 h-5 text-indigo-400" />
            <span>System Default</span>
          </button>
        </div>
      </GlassCard>

      {isLoading ? (
        <GlassCard className="p-8 text-center text-xs font-mono text-[#8C929B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" />
          <span>Loading Vault config...</span>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {/* 1-Click System Backup & Export Card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#17191D]">
                <Archive className="w-4 h-4 text-emerald-600" />
                <h3>1-Click Full System Backup (.zip)</h3>
              </div>
              <Badge variant="emerald">JSON + Markdown</Badge>
            </div>

            <p className="text-xs text-[#646A73] font-sans">
              Generate a full server-side backup containing your structured <code className="text-emerald-800 font-mono">database.json</code> and formatted Markdown files for Notes, Journals, Tasks, Projects, Skills, Time Sessions, Mistakes, and GitHub/LeetCode logs. Credentials and API secrets are automatically filtered out.
            </p>

            {backupMessage && (
              <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
                backupMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {backupMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                <span>{backupMessage.text}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#E2E5E9] font-mono">
              <span className="text-[11px] text-[#8C929B]">Archive generated in server memory before download.</span>

              <Button
                onClick={handleDownloadBackup}
                disabled={isExporting}
                variant="primary"
                size="md"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Export System Backup (.zip)</span>
              </Button>
            </div>
          </GlassCard>

          {/* Persistent Student Learning History Card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--exec-border)] pb-3 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--exec-text)]">
                <Sparkles className="w-4 h-4 text-[#0284C7]" />
                <h3>Deterministic Student Learning History</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={historyStats?.hasHistory ? 'emerald' : 'slate'}>
                  {historyStats?.hasHistory ? 'Database Seed Active' : 'Unseeded'}
                </Badge>
              </div>
            </div>

            <p className="text-xs text-[var(--exec-text-muted)] font-sans leading-relaxed">
              Populates approximately 10 days of varied, persistent learning history (tasks, study sessions, mistakes, daily reflections, notes, and skills) into your authenticated Supabase database. This gives the Learning Orchestrator evidence to produce personalized, grounded roadmaps.
            </p>

            <div className="p-3.5 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl font-mono text-xs text-[var(--exec-text)] space-y-1">
              <div className="text-[11px] font-bold text-[var(--exec-text-muted)] uppercase tracking-wider">Database Status</div>
              <p className="font-semibold text-sky-700 dark:text-sky-300">
                Learning history loaded: {historyStats?.tasksCount ?? 0} tasks, {historyStats?.timeSessionsCount ?? 0} study sessions, {historyStats?.mistakesCount ?? 0} mistakes, {historyStats?.journalEntriesCount ?? 0} journal entries, {historyStats?.notesCount ?? 0} notes, {historyStats?.skillsCount ?? 0} skills.
              </p>
              <div className="text-[10px] text-[var(--exec-text-subtle)] pt-1">
                Spans 10-day timeline with zero modifications to GitHub or LeetCode data. Idempotent.
              </div>
            </div>

            {seedMessage && (
              <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-mono border ${
                seedMessage.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' 
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}>
                {seedMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{seedMessage.text}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[var(--exec-border)] font-mono">
              <span className="text-[11px] text-[var(--exec-text-subtle)]">
                Protected server action • Authenticated user scoped
              </span>

              <div className="flex items-center gap-2">
                {historyStats?.hasHistory && (
                  <Button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={isClearing || isSeeding}
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs"
                  >
                    {isClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Clear Demo History</span>
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={handleSeedHistory}
                  disabled={isSeeding || isClearing}
                  variant="primary"
                  size="md"
                >
                  {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{historyStats?.hasHistory ? 'Refresh Demo Learning History' : 'Load Demo Learning History'}</span>
                </Button>
              </div>
            </div>
          </GlassCard>

          {/* Gemini Vault Card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
                <Sparkles className="w-4 h-4 text-[#0284C7]" />
                <h3>Google Gemini API Provider</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#646A73]">Health:</span>
                <Badge variant={vaultConfig?.health_status === 'healthy' ? 'emerald' : 'crimson'}>
                  {vaultConfig?.health_status || 'Unconfigured'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">Stored Key Status</span>
                <p className="font-bold text-[#17191D]">
                  {vaultConfig?.has_key ? '●●●●●●●●●● (Encrypted in Vault)' : 'No key configured'}
                </p>
              </div>
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">Active AI Model</span>
                <p className="font-bold text-[#0284C7]">{vaultConfig?.selected_model || selectedModel}</p>
              </div>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-4 pt-3 border-t border-[#E2E5E9]">
              <div className="space-y-3 font-mono">
                <div>
                  <label className="block text-xs font-bold text-[#646A73] uppercase mb-1">
                    Replace / Enter Gemini API Key
                  </label>
                  <Input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste your AIStudio Gemini API key here..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#646A73] uppercase mb-1">
                    Select Configurable Gemini Model
                  </label>
                  <Select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {SUPPORTED_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {message && (
                <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
                  message.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 font-mono">
                <Button
                  type="button"
                  onClick={handleTestKey}
                  disabled={isTesting || !vaultConfig?.has_key}
                  variant="outline"
                  size="sm"
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-emerald-600" />}
                  <span>Run Gemini Ping Test</span>
                </Button>

                <Button
                  type="submit"
                  disabled={isSaving || (!apiKeyInput.trim() && selectedModel === (vaultConfig?.selected_model || 'gemini-1.5-flash'))}
                  variant="primary"
                  size="md"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{apiKeyInput.trim() ? 'Save API Key & Model' : 'Save Selected Model'}</span>
                </Button>
              </div>
            </form>
          </GlassCard>

          {/* GitHub PAT Vault Card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
                <FolderGit2 className="w-4 h-4 text-[#0284C7]" />
                <h3>GitHub Personal Access Token (PAT)</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#646A73]">Health:</span>
                <Badge variant={githubConfig?.health_status === 'healthy' ? 'emerald' : 'crimson'}>
                  {githubConfig?.health_status || 'Unconfigured'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">GitHub Token Status</span>
                <p className="font-bold text-[#17191D]">
                  {githubConfig?.has_key ? '●●●●●●●●●● (Encrypted in Vault)' : 'No token configured'}
                </p>
              </div>
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">Last Checked</span>
                <p className="font-bold text-[#646A73]">
                  {githubConfig?.last_checked_at ? new Date(githubConfig.last_checked_at).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveGitHubToken} className="space-y-4 pt-3 border-t border-[#E2E5E9]">
              <div>
                <label className="block text-xs font-mono font-bold text-[#646A73] uppercase mb-1">
                  Replace / Enter GitHub Personal Access Token (`repo` & `read:user` scopes)
                </label>
                <Input
                  type="password"
                  value={githubTokenInput}
                  onChange={(e) => setGithubTokenInput(e.target.value)}
                  placeholder="ghp_... or github_pat_..."
                />
              </div>

              {ghMessage && (
                <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
                  ghMessage.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {ghMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>{ghMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 font-mono">
                <Button
                  type="button"
                  onClick={handleTestGitHub}
                  disabled={isTestingGh || !githubConfig?.has_key}
                  variant="outline"
                  size="sm"
                >
                  {isTestingGh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-[#0284C7]" />}
                  <span>Run Connection Test</span>
                </Button>

                <Button
                  type="submit"
                  disabled={isSavingGh || !githubTokenInput.trim()}
                  variant="primary"
                  size="md"
                >
                  {isSavingGh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save GitHub Token</span>
                </Button>
              </div>
            </form>
          </GlassCard>

          {/* LeetCode Vault Card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
                <Code2 className="w-4 h-4 text-amber-600" />
                <h3>LeetCode Account Configuration</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#646A73]">Health:</span>
                <Badge variant={leetcodeConfig?.health_status === 'healthy' ? 'emerald' : 'crimson'}>
                  {leetcodeConfig?.health_status || 'Unconfigured'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">LeetCode Handle</span>
                <p className="font-bold text-[#17191D]">
                  {leetcodeConfig?.username ? `@${leetcodeConfig.username}` : 'No handle configured'}
                </p>
              </div>
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[#8C929B] text-[11px]">Last Checked</span>
                <p className="font-bold text-[#646A73]">
                  {leetcodeConfig?.last_checked_at ? new Date(leetcodeConfig.last_checked_at).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveLeetCodeConfig} className="space-y-4 pt-3 border-t border-[#E2E5E9]">
              <div>
                <label className="block text-xs font-mono font-bold text-[#646A73] uppercase mb-1">
                  LeetCode Username / Public Handle
                </label>
                <Input
                  type="text"
                  value={leetcodeUsernameInput}
                  onChange={(e) => setLeetcodeUsernameInput(e.target.value)}
                  placeholder="e.g. tirupathi, neetcode, tourist"
                  required
                />
              </div>

              {lcMessage && (
                <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
                  lcMessage.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {lcMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>{lcMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 font-mono">
                <Button
                  type="button"
                  onClick={handleTestLeetCode}
                  disabled={isTestingLc || !leetcodeUsernameInput.trim()}
                  variant="outline"
                  size="sm"
                >
                  {isTestingLc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-amber-600" />}
                  <span>Run Health Check</span>
                </Button>

                <Button
                  type="submit"
                  disabled={isSavingLc || !leetcodeUsernameInput.trim()}
                  variant="secondary"
                  size="md"
                >
                  {isSavingLc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save LeetCode Handle</span>
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
