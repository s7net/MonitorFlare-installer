import React, { useState, useEffect } from 'react';
import { CloudflareService, CloudflareAccount } from './services/cloudflare';
import { generateRandomCredentials, generateWorkerName, hashPassword } from './utils/credentials';
import { Shield, Cloud, Bot, Sparkles, CheckCircle2, AlertCircle, Copy, Check, ArrowRight, RefreshCw, ExternalLink, KeyRound, Database, FileCode } from 'lucide-react';

export default function App() {
  const [step, setStep] = useState<number>(1);
  const [apiToken, setApiToken] = useState<string>('');
  const [accounts, setAccounts] = useState<CloudflareAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isVerifyingToken, setIsVerifyingToken] = useState<boolean>(false);
  const [tokenVerified, setTokenVerified] = useState<boolean>(false);

  // Workers Subdomain & Deployment Names
  const [workerName, setWorkerName] = useState<string>(() => generateWorkerName());
  const [workersSubdomain, setWorkersSubdomain] = useState<string>('');
  const [isFetchingSubdomain, setIsFetchingSubdomain] = useState<boolean>(false);
  const [d1DatabaseName, setD1DatabaseName] = useState<string>('monitorflare');

  // Admin Credentials
  const [adminUsername, setAdminUsername] = useState<string>('admin');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [adminPath, setAdminPath] = useState<string>('/manage-x7k9');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Telegram Integration
  const [botToken, setBotToken] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [testingTelegram, setTestingTelegram] = useState<boolean>(false);
  const [telegramStatus, setTelegramStatus] = useState<{ success?: boolean; message?: string }>({});

  // Site Brand Settings
  const [brandName, setBrandName] = useState<string>('MonitorFlare Status');
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>('');

  // Auto-Deployment Execution Progress
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployLogs, setDeployLogs] = useState<Array<{ msg: string; status: 'pending' | 'success' | 'error' }>>([]);
  const [deploymentResult, setDeploymentResult] = useState<{
    databaseId?: string;
    adminUrl?: string;
    secretPath?: string;
    workerBaseUrl?: string;
    wranglerToml?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Fetch Workers Subdomain from Cloudflare API when Account changes
  const fetchSubdomainForAccount = async (accId: string, token: string) => {
    if (!accId || !token) return;
    setIsFetchingSubdomain(true);
    try {
      const sub = await CloudflareService.getWorkersSubdomain(token.trim(), accId);
      if (sub) {
        setWorkersSubdomain(sub);
      }
    } catch {
      // Keep existing subdomain or fallback
    } finally {
      setIsFetchingSubdomain(false);
    }
  };

  // Handle Account Dropdown Selection Change
  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    if (apiToken) {
      fetchSubdomainForAccount(accId, apiToken);
    }
  };

  // Handle Cloudflare Token Verification
  const handleVerifyToken = async () => {
    if (!apiToken.trim()) return;
    setIsVerifyingToken(true);
    setErrorMsg('');
    try {
      const isValid = await CloudflareService.verifyToken(apiToken.trim());
      if (isValid) {
        setTokenVerified(true);
        const accList = await CloudflareService.getAccounts(apiToken.trim());
        setAccounts(accList);
        if (accList.length > 0) {
          const firstAccId = accList[0].id;
          setSelectedAccountId(firstAccId);
          await fetchSubdomainForAccount(firstAccId, apiToken.trim());
        }
      } else {
        setTokenVerified(false);
        setErrorMsg('Invalid Cloudflare API Token. Please check your token permissions.');
      }
    } catch (err: any) {
      setTokenVerified(false);
      setErrorMsg(err.message || 'Connection error to Cloudflare API');
    } finally {
      setIsVerifyingToken(false);
    }
  };

  // Generate Random Credentials
  const handleGenerateRandom = () => {
    const creds = generateRandomCredentials();
    setAdminUsername(creds.adminUsername);
    setAdminPassword(creds.adminPassword);
    setAdminPath(creds.adminPath);
    setWorkerName(creds.workerName);
  };

  // Calculate live Worker Base URL
  const activeSubdomain = workersSubdomain.trim() || 'subdomain';
  const activeWorkerName = workerName.trim() || 'monitorflare';
  const computedWorkerBaseUrl = `https://${activeWorkerName}.${activeSubdomain}.workers.dev`;
  const computedAdminUrl = `${computedWorkerBaseUrl}${adminPath.startsWith('/') ? adminPath : '/' + adminPath}`;

  // Test Telegram Bot
  const handleTestTelegram = async () => {
    if (!botToken || !chatId) return;
    setTestingTelegram(true);
    setTelegramStatus({});
    try {
      const ok = await CloudflareService.testTelegramBot(botToken.trim(), chatId.trim());
      if (ok) {
        setTelegramStatus({ success: true, message: '✓ Test message sent to Telegram successfully!' });
      } else {
        setTelegramStatus({ success: false, message: '✗ Failed to send message. Verify Bot Token & Chat ID.' });
      }
    } catch {
      setTelegramStatus({ success: false, message: '✗ Error connecting to Telegram API.' });
    } finally {
      setTestingTelegram(false);
    }
  };

  // Copy to Clipboard Helper
  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Direct Token URL
  const cloudflareTokenUrl = 'https://dash.cloudflare.com/profile/api-tokens?template=edit_workers';

  // Run 100% Client-Side Automated Provisioning & Deployment
  const handleRunAutoDeploy = async () => {
    if (!selectedAccountId || !apiToken) {
      setErrorMsg('Cloudflare API Token and Account are required.');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setErrorMsg('Admin password must be at least 6 characters.');
      return;
    }

    setIsDeploying(true);
    setErrorMsg('');
    setDeployLogs([]);

    const addLog = (msg: string, status: 'pending' | 'success' | 'error') => {
      setDeployLogs(prev => [...prev.filter(l => l.msg !== msg), { msg, status }]);
    };

    try {
      // 1. Provision Cloudflare D1 Database
      const dbName = d1DatabaseName.trim() || 'monitorflare';
      addLog(`Provisioning Cloudflare D1 Database ("${dbName}")...`, 'pending');
      const dbUuid = await CloudflareService.createD1Database(apiToken.trim(), selectedAccountId, dbName);
      addLog(`✓ Cloudflare D1 Database Provisioned (ID: ${dbUuid.slice(0, 8)}...)`, 'success');

      // 2. Apply All D1 Migrations
      addLog('Applying D1 Table Schemas (0000 - 0004)...', 'pending');
      await CloudflareService.applyAllMigrations(apiToken.trim(), selectedAccountId, dbUuid);
      addLog('✓ D1 Database Schemas & Migrations Created Successfully', 'success');

      // 3. Hash Admin Password & Seed Initial Settings
      addLog('Hashing Admin Password with Web Crypto SHA-256...', 'pending');
      const pwdHash = await hashPassword(adminPassword);

      addLog('Seeding Master Admin & System Settings into D1...', 'pending');
      const settingsMap: Record<string, string> = {
        admin_username: adminUsername,
        admin_password_hash: pwdHash,
        admin_panel_path: adminPath,
        base_url: computedWorkerBaseUrl,
        brand_name: brandName,
        brand_logo_url: brandLogoUrl,
      };

      if (botToken && chatId) {
        await CloudflareService.executeD1Query(
          apiToken.trim(),
          selectedAccountId,
          dbUuid,
          `INSERT INTO notifications (id, type, enabled, config, created_at) VALUES ('notif_telegram', 'telegram', 1, ?, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config;`,
          [JSON.stringify({ botToken, chatId }), Date.now()]
        );
      }

      await CloudflareService.seedSettings(apiToken.trim(), selectedAccountId, dbUuid, settingsMap);
      addLog('✓ Admin Security Credentials & Settings Saved to D1', 'success');

      // 4. Fetch Pre-compiled Worker Code & Upload to Cloudflare Workers API
      addLog(`Fetching pre-compiled MonitorFlare Worker code...`, 'pending');
      const bundleRes = await fetch('/worker-bundle.js');
      if (!bundleRes.ok) {
        throw new Error('Failed to load pre-compiled MonitorFlare Worker code from installer.');
      }
      const workerCode = await bundleRes.text();

      addLog(`Deploying Worker script "${activeWorkerName}" to Cloudflare Workers...`, 'pending');
      await CloudflareService.deployWorkerScript(
        apiToken.trim(),
        selectedAccountId,
        activeWorkerName,
        dbUuid,
        workerCode
      );
      addLog(`✓ Cloudflare Worker "${activeWorkerName}" Uploaded & Deployed!`, 'success');

      // 5. Enable workers.dev Subdomain Route
      addLog(`Enabling workers.dev subdomain route (${computedWorkerBaseUrl})...`, 'pending');
      await CloudflareService.enableWorkerSubdomain(
        apiToken.trim(),
        selectedAccountId,
        activeWorkerName
      );
      addLog(`✓ Route Enabled: ${computedWorkerBaseUrl}`, 'success');

      // 6. Enable 1-Minute Cron Trigger Monitoring
      addLog('Configuring 1-minute Cron Trigger monitoring (* * * * *)...', 'pending');
      await CloudflareService.enableWorkerCronTriggers(
        apiToken.trim(),
        selectedAccountId,
        activeWorkerName
      );
      addLog('✓ 1-Minute Health Check Cron Trigger Activated', 'success');

      // 7. Generate wrangler.toml Config Snippet
      const wranglerToml = `name = "${activeWorkerName}"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat_v2"]

[[d1_databases]]
binding = "DB"
database_name = "${dbName}"
database_id = "${dbUuid}"

[triggers]
crons = ["* * * * *"]`;

      // 8. Set Deployment Result Summary
      setDeploymentResult({
        databaseId: dbUuid,
        workerBaseUrl: computedWorkerBaseUrl,
        adminUrl: computedAdminUrl,
        secretPath: adminPath,
        wranglerToml,
      });

      addLog('🚀 100% Automated Deployment & Launch Complete!', 'success');
      setStep(5);
    } catch (err: any) {
      setErrorMsg(err.message || 'Auto-deployment encountered an error');
      addLog('✗ Deployment Failed: ' + (err.message || 'Error'), 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 mb-3 shadow-lg shadow-brand/5">
          <Cloud className="w-8 h-8 text-brand" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">MonitorFlare 1-Click Client-Side Auto Deployer</h1>
        <p className="text-xs text-zinc-400 mt-2 max-w-md mx-auto leading-relaxed">
          Deploy your serverless health monitoring system directly from your browser with zero backend server dependencies.
        </p>
      </div>

      {/* Stepper Dots */}
      <div className="bg-[#1c1c20] border border-[#333339] rounded-xl p-4 mb-6 shadow-xl">
        <div className="flex items-center justify-between px-4">
          {[
            { num: 1, label: 'Cloudflare' },
            { num: 2, label: 'Configuration' },
            { num: 3, label: 'Telegram' },
            { num: 4, label: 'Provision' },
            { num: 5, label: 'Complete' },
          ].map(s => (
            <div key={s.num} className="flex flex-col items-center gap-1.5 z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s.num
                    ? 'bg-brand text-white ring-4 ring-brand/20'
                    : step > s.num
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#29292e] text-zinc-400 border border-[#333339]'
                }`}
              >
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className="text-[11px] font-medium text-zinc-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-[#1c1c20] border border-[#333339] rounded-xl p-6 md:p-8 shadow-2xl">
        
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* STEP 1: CLOUDFLARE API TOKEN WITH D1 PERMISSION GUIDE */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Cloud className="w-5 h-5 text-brand" />
                Step 1: Cloudflare Token Connection
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Create a Cloudflare API Token with Workers & D1 Database permissions.
              </p>
            </div>

            {/* Token Creation Card */}
            <div className="p-5 rounded-xl bg-gradient-to-r from-brand/20 to-orange-600/10 border border-brand/30 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-brand/20 pb-3">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-brand" />
                    Open Cloudflare API Token Page
                  </div>
                  <p className="text-xs text-zinc-300">
                    Click the button to open Cloudflare token creator page.
                  </p>
                </div>

                <a
                  href={cloudflareTokenUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 flex-shrink-0 no-underline shadow-lg shadow-brand/25 transition-all transform hover:-translate-y-0.5"
                >
                  <span>🚀 Open Cloudflare Token Page</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* CRITICAL NOTE: Adding Cloudflare D1 Permission */}
              <div className="p-3 rounded-lg bg-[#121215]/90 border border-amber-500/40 text-xs text-zinc-200 space-y-2">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Database className="w-4 h-4" />
                  Required Cloudflare Permissions:
                </div>
                <ul className="text-[11px] text-zinc-300 leading-relaxed space-y-1 list-disc pl-4">
                  <li><strong>Account → Cloudflare D1 → Edit</strong> (To auto-create D1 database)</li>
                  <li><strong>Account → Workers Scripts → Edit</strong> (To deploy Worker)</li>
                  <li><strong>Account → Account Settings → Read</strong> (To read Account ID)</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Paste Cloudflare API Token</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    placeholder="Paste token string here..."
                    className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                  />
                  <button
                    onClick={handleVerifyToken}
                    disabled={isVerifyingToken || !apiToken}
                    className="px-5 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-hover disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  >
                    {isVerifyingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify Token'}
                  </button>
                </div>
              </div>

              {tokenVerified && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>✓ Cloudflare API Token Verified & Connected Successfully!</span>
                </div>
              )}

              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Select Cloudflare Account</label>
                  <select
                    value={selectedAccountId}
                    onChange={e => handleAccountChange(e.target.value)}
                    className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#333339]">
              <button
                onClick={() => setStep(2)}
                disabled={!tokenVerified || !selectedAccountId}
                className="px-6 py-2.5 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-hover disabled:opacity-50 flex items-center gap-2"
              >
                Next: System Configuration <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SECURITY & SYSTEM CONFIGURATION */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-brand" />
                  Step 2: Admin & Deployment Configuration
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure master admin credentials, worker names, and custom secret admin path.
                </p>
              </div>

              <button
                onClick={handleGenerateRandom}
                className="px-3 py-1.5 bg-[#29292e] hover:bg-[#333339] border border-[#333339] rounded-lg text-xs text-brand font-medium flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                ⚡️ Generate Random Config
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Admin Username</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={e => setAdminUsername(e.target.value)}
                    className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Admin Password</label>
                  <input
                    type="text"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Enter or generate password..."
                    className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Worker Name <span className="text-zinc-500 font-normal">(Cloudflare Worker slug)</span></label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={e => setWorkerName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. monitorflare"
                    className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Cloudflare Workers Subdomain
                    {isFetchingSubdomain && <RefreshCw className="inline w-3 h-3 ml-1.5 animate-spin text-brand" />}
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={workersSubdomain}
                      onChange={e => setWorkersSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="e.g. ahsvip"
                      className="w-full bg-[#121215] border border-[#333339] rounded-l-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                      required
                    />
                    <span className="bg-[#29292e] border border-l-0 border-[#333339] text-zinc-400 text-xs px-3 py-2.5 rounded-r-lg font-mono flex-shrink-0">
                      .workers.dev
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Secret Admin Panel Path</label>
                <input
                  type="text"
                  value={adminPath}
                  onChange={e => setAdminPath(e.target.value)}
                  className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono"
                  required
                />
                <p className="text-[11px] text-zinc-500 mt-1">Standard <code>/admin</code> path is hidden for maximum security.</p>
              </div>

              {/* Live URL Preview Card */}
              <div className="p-4 rounded-xl bg-[#121215] border border-[#333339] space-y-2">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Live URL Preview</div>
                <div className="text-xs text-emerald-400 font-mono break-all">
                  🌐 Worker Public URL: {computedWorkerBaseUrl}
                </div>
                <div className="text-xs text-brand font-mono break-all">
                  🔑 Admin Dashboard URL: {computedAdminUrl}
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-[#333339]">
              <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs font-medium hover:bg-[#333339]">
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!adminUsername || !adminPassword || !workerName || !workersSubdomain}
                className="px-6 py-2.5 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-hover disabled:opacity-50 flex items-center gap-2"
              >
                Next: Telegram Bot <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: TELEGRAM INTEGRATION */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-brand" />
                Step 3: Telegram Alert Bot (Optional)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Configure instant Telegram notifications when health monitors detect outages.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Telegram Bot Token</label>
                <input
                  type="text"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456789:ABCDefgh..."
                  className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Telegram Chat ID / Channel ID</label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="-100123456789"
                  className="w-full bg-[#121215] border border-[#333339] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand font-mono text-xs"
                />
              </div>

              {telegramStatus.message && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    telegramStatus.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  {telegramStatus.message}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-[#333339]">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs font-medium hover:bg-[#333339]">
                ← Back
              </button>

              <div className="flex gap-2">
                {botToken && chatId && (
                  <button
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    className="px-4 py-2.5 bg-[#29292e] text-zinc-200 rounded-lg text-xs font-medium hover:bg-[#333339] flex items-center gap-1.5"
                  >
                    {testingTelegram ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : '✈️ Test Telegram Connection'}
                  </button>
                )}
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-2.5 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-hover flex items-center gap-2"
                >
                  Next: Review & Provision <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: AUTOMATED PROVISIONING */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand" />
                Step 4: Provision Cloudflare Resources
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Click below to provision the D1 Database and seed your configuration via Cloudflare REST API.
              </p>
            </div>

            {/* Live Progress Logs */}
            <div className="p-4 rounded-xl bg-[#121215] border border-[#333339] space-y-2 max-h-60 overflow-y-auto">
              {deployLogs.length === 0 ? (
                <div className="text-xs text-zinc-500 text-center py-4">Click "Run Auto-Deploy" to start Cloudflare provisioning.</div>
              ) : (
                deployLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-xs font-mono flex items-center gap-2 ${
                      log.status === 'success' ? 'text-emerald-400' : log.status === 'error' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {log.status === 'pending' && <RefreshCw className="w-3 h-3 animate-spin" />}
                    {log.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                    {log.status === 'error' && <AlertCircle className="w-3 h-3" />}
                    <span>{log.msg}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-[#333339]">
              <button onClick={() => setStep(3)} disabled={isDeploying} className="px-5 py-2.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs font-medium hover:bg-[#333339] disabled:opacity-50">
                ← Back
              </button>

              <button
                onClick={handleRunAutoDeploy}
                disabled={isDeploying}
                className="px-8 py-3 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-hover disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-brand/20"
              >
                {isDeploying ? <RefreshCw className="w-4 h-4 animate-spin" /> : '🚀 Run Auto-Provisioning & Deploy'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: DEPLOYMENT COMPLETE & SECRETS CARD */}
        {step === 5 && deploymentResult && (
          <div className="space-y-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white">MonitorFlare Successfully Provisioned!</h2>
              <p className="text-xs text-zinc-400 mt-1">Your D1 database, security credentials, and alert settings are configured in Cloudflare.</p>
            </div>

            {/* Secret Credentials Card */}
            <div className="text-left bg-[#121215] border border-[#333339] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#333339] pb-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Deployment Summary</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono font-semibold">Ready to Use</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Admin Panel URL</label>
                <div className="flex gap-2">
                  <input type="text" readOnly value={deploymentResult.adminUrl} className="w-full bg-[#1c1c20] border border-[#333339] rounded-lg px-3 py-1.5 text-xs text-brand font-mono" />
                  <button onClick={() => copyToClipboard(deploymentResult.adminUrl!, 'url')} className="px-3 py-1.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs flex items-center gap-1">
                    {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Admin Username</label>
                  <div className="flex gap-2">
                    <input type="text" readOnly value={adminUsername} className="w-full bg-[#1c1c20] border border-[#333339] rounded-lg px-3 py-1.5 text-xs text-white font-mono" />
                    <button onClick={() => copyToClipboard(adminUsername, 'user')} className="px-3 py-1.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs">
                      {copiedField === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Admin Password</label>
                  <div className="flex gap-2">
                    <input type="text" readOnly value={adminPassword} className="w-full bg-[#1c1c20] border border-[#333339] rounded-lg px-3 py-1.5 text-xs text-white font-mono" />
                    <button onClick={() => copyToClipboard(adminPassword, 'pwd')} className="px-3 py-1.5 bg-[#29292e] text-zinc-300 rounded-lg text-xs">
                      {copiedField === 'pwd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Wrangler.toml Generated Config Snippet */}
              {deploymentResult.wranglerToml && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-brand" />
                      Generated <code>wrangler.toml</code> for your repository:
                    </label>
                    <button
                      onClick={() => copyToClipboard(deploymentResult.wranglerToml!, 'toml')}
                      className="px-2.5 py-1 bg-[#29292e] hover:bg-[#333339] text-zinc-300 rounded text-[11px] font-mono flex items-center gap-1"
                    >
                      {copiedField === 'toml' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy wrangler.toml
                    </button>
                  </div>
                  <pre className="p-3 bg-[#0d0d10] border border-[#2a2a30] rounded-lg text-[11px] text-emerald-400 font-mono overflow-x-auto whitespace-pre">
                    {deploymentResult.wranglerToml}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-center">
              <a
                href={deploymentResult.adminUrl}
                target="_blank"
                rel="noreferrer"
                className="px-8 py-3 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-hover inline-flex items-center gap-2 shadow-lg shadow-brand/20 no-underline"
              >
                Open Admin Dashboard <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
