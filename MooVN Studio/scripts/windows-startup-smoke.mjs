// Windows release gate: install the actual NSIS package, start the installed
// editor and use Windows UI Automation to open the sample project. This is a
// narrow startup smoke test, not a full desktop acceptance test.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function runInstaller(executable, args, { timeoutMs = 180_000, windowsVerbatimArguments = false } = {}) {
  const child = spawn(executable, args, { stdio: 'inherit', windowsVerbatimArguments });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  try {
    const result = await new Promise((resolveResult, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolveResult({ code, signal }));
    });
    if (timedOut) throw new Error(`Installer timed out after ${timeoutMs} ms`);
    if (result.code !== 0) throw new Error(`Installer failed: exit=${result.code}, signal=${result.signal}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkApp(executable, { args = [], probe, timeoutMs = 60_000, pollMs = 1_000, stableMs = 2_000 } = {}) {
  if (typeof probe !== 'function') throw new Error('A real window probe is required');
  const child = spawn(executable, args, { stdio: 'ignore' });
  let exited = null;
  let processError = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  child.on('error', (error) => { processError = error; });
  const ensureRunning = () => {
    if (processError) throw new Error(`Could not start editor: ${processError.message}`);
    if (exited) throw new Error(`Editor exited: exit=${exited.code}, signal=${exited.signal}`);
  };
  async function waitFor(phase) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ensureRunning();
      if (child.pid) {
        const ready = await probe(child.pid, phase);
        ensureRunning();
        if (ready) return;
      }
      await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
    ensureRunning();
    throw new Error(`Timed out waiting for ${phase}; the editor may be blank or blocked`);
  }
  try {
    await waitFor('launcher');
    await waitFor('workbench');
    await sleep(stableMs);
    ensureRunning();
    if (!(await probe(child.pid, 'workbench'))) throw new Error('Workbench disappeared after startup');
    ensureRunning();
  } finally {
    if (child.pid && !exited) {
      const closed = new Promise((done) => child.once('exit', done));
      child.kill();
      let timer;
      await Promise.race([closed, new Promise((done) => { timer = setTimeout(done, 5_000); })]);
      clearTimeout(timer);
      if (!exited) {
        child.kill('SIGKILL');
        await closed;
      }
    }
  }
}

// The launcher button and workbench action are real controls in the shipped
// UI. A window title alone is insufficient: a blank WebView must fail the gate.
async function probeWindowsUi(pid, phase) {
  const name = phase === 'launcher' ? '打开入门示例工程' : '导出游戏';
  const invoke = phase === 'launcher'
    ? '$pattern = $item.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern); $pattern.Invoke()'
    : '';
  const requireLauncherClosed = phase === 'workbench' ? `
$launcherName = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '打开入门示例工程')
$launcher = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $launcherName)
if ($null -ne $launcher) { [Console]::Out.Write('waiting'); exit 0 }
` : '';
  const script = `
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($null -eq $process) { [Console]::Out.Write('waiting'); exit 0 }
$process.Refresh()
if ($process.MainWindowHandle -eq 0) { [Console]::Out.Write('waiting'); exit 0 }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
if ($null -eq $root) { [Console]::Out.Write('waiting'); exit 0 }
${requireLauncherClosed}
$name = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '${name}')
$type = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$condition = [System.Windows.Automation.AndCondition]::new($name, $type)
$item = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
if ($null -eq $item -or -not $item.Current.IsEnabled -or $item.Current.IsOffscreen) { [Console]::Out.Write('waiting'); exit 0 }
${invoke}
[Console]::Out.Write('ready')
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  let result;
  try {
    result = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeout: 15_000 });
  } catch (error) {
    throw new Error(`Windows UI Automation failed for ${phase}: ${error.message}`);
  }
  const answer = result.stdout.trim();
  if (answer === 'waiting') return false;
  if (answer === 'ready') return true;
  throw new Error(`Unexpected UI Automation output for ${phase}: ${answer}; ${result.stderr.trim()}`);
}

export function requireDisposableWindowsRunner(platform, env) {
  if (platform !== 'win32') throw new Error('The installer smoke test must run on Windows');
  // A real installer can modify registry entries and shortcuts, or replace an
  // existing installation. Never run it on a developer or self-hosted machine.
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('Run this installer test only on a disposable GitHub-hosted runner');
  }
}

async function main() {
  requireDisposableWindowsRunner(process.platform, process.env);
  const installer = process.argv[2] ? resolve(process.argv[2]) : '';
  if (!installer || !existsSync(installer)) throw new Error('Pass the built NSIS installer path');
  const installDir = mkdtempSync(join(tmpdir(), 'moovn-install-smoke-'));
  try {
    // NSIS requires /D to be the last argument and unquoted, even for spaces.
    await runInstaller(installer, ['/S', `/D=${installDir}`], { windowsVerbatimArguments: true });
    const executable = join(installDir, 'moovn.exe');
    if (!existsSync(executable)) throw new Error(`Installer did not create ${executable}`);
    await checkApp(executable, { probe: probeWindowsUi });
    console.log('Windows NSIS smoke: installed editor launched and opened the sample workbench');
  } finally {
    rmSync(installDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
