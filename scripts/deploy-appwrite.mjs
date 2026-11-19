import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {Client, Functions, Sites} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function parseArgs(argv) {
  const options = {target: 'all', activate: true};
  for (const arg of argv) {
    if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    else if (arg.startsWith('--activate=')) options.activate = arg.slice('--activate='.length) !== 'false';
  }
  if (!['all', 'site', 'functions'].includes(options.target)) {
    throw Error(`Invalid --target "${options.target}". Expected all, site, or functions.`);
  }
  return options;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForDeployment(label, readStatus) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const deployment = await readStatus();
    console.log(`[deploy] ${label}: deployment ${deployment.$id} status=${deployment.status}`);
    if (deployment.status === 'ready') return deployment;
    if (['failed', 'canceled'].includes(deployment.status)) {
      const detail = deployment.buildLogs ? `\n${deployment.buildLogs.slice(-2000)}` : '';
      throw Error(`${label} deployment ${deployment.$id} ${deployment.status}.${detail}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw Error(`${label} deployment timed out after ${POLL_TIMEOUT_MS / 1000}s.`);
}

function stageAndArchive(packagerScript, stageFile, archiveName) {
  mkdirSync('.local', {recursive: true});
  execFileSync(process.execPath, [packagerScript], {stdio: 'pipe'});
  const stage = JSON.parse(readFileSync(stageFile, 'utf8'));
  const archive = resolve('.local', archiveName);
  execFileSync('tar', ['-czf', archive, '-C', stage.destination, '.'], {stdio: 'pipe'});
  return {stage, archive};
}

async function deploySite(client, {activate}) {
  const siteId = process.env.APPWRITE_SITE_ID || 'nourishing-cloud';
  const sites = new Sites(client);
  const {stage, archive} = stageAndArchive('scripts/package-site.mjs', '.local/site-stage.json', 'site-deployment.tar.gz');
  try {
    console.log(`[deploy] Uploading site "${siteId}" (activate=${activate})...`);
    const created = await sites.createDeployment({
      siteId,
      code: InputFile.fromPath(archive, 'site.tar.gz'),
      activate,
    });
    await waitForDeployment(`site:${siteId}`, () => sites.getDeployment({siteId, deploymentId: created.$id}));
  } finally {
    rmSync(archive, {force: true});
    rmSync(stage.destination, {recursive: true, force: true});
  }
}

async function deployFunction(client, {name, functionId, packagerScript, stageFile, entrypoint, commands, activate}) {
  const functions = new Functions(client);
  const {stage, archive} = stageAndArchive(packagerScript, stageFile, `${name}.tar.gz`);
  try {
    console.log(`[deploy] Uploading function "${functionId}" (activate=${activate})...`);
    const created = await functions.createDeployment({
      functionId,
      code: InputFile.fromPath(archive, `${name}.tar.gz`),
      activate,
      entrypoint: stage.entrypoint ?? entrypoint,
      commands: stage.commands ?? commands,
    });
    await waitForDeployment(`function:${functionId}`, () => functions.getDeployment({functionId, deploymentId: created.$id}));
  } finally {
    rmSync(archive, {force: true});
    rmSync(stage.destination, {recursive: true, force: true});
  }
}

async function main() {
  const {target, activate} = parseArgs(process.argv.slice(2));
  const apiKey = process.env.APPWRITE_API_KEY?.trim();
  if (!apiKey) throw Error('APPWRITE_API_KEY is required.');

  const config = JSON.parse(readFileSync(new URL('../appwrite.config.json', import.meta.url), 'utf8'));
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || config.endpoint)
    .setProject(process.env.APPWRITE_PROJECT_ID || config.projectId)
    .setKey(apiKey);

  if (target === 'all' || target === 'site') {
    await deploySite(client, {activate});
  }

  if (target === 'all' || target === 'functions') {
    const specs = [
      {
        name: 'reminders',
        functionId: process.env.APPWRITE_REMINDERS_FUNCTION_ID || 'nourishing-reminders',
        packagerScript: 'scripts/package-reminders.mjs',
        stageFile: '.local/reminders-stage.json',
        entrypoint: 'server/reminder-schedules-entry.mjs',
        commands: 'npm ci --omit=dev',
      },
      {
        name: 'scheduler',
        functionId: process.env.APPWRITE_SCHEDULER_FUNCTION_ID || 'nourishing-scheduler',
        packagerScript: 'scripts/package-scheduler.mjs',
        stageFile: '.local/scheduler-stage.json',
        entrypoint: 'server/scheduler-entry.mjs',
        commands: 'npm ci --omit=dev',
      },
      {
        name: 'account-cleanup',
        functionId: process.env.APPWRITE_CLEANUP_FUNCTION_ID || 'nourishing-account-cleanup',
        packagerScript: 'scripts/package-account-cleanup.mjs',
        stageFile: '.local/account-cleanup-stage.json',
        entrypoint: 'server/account-cleanup-entry.mjs',
        commands: 'npm ci --omit=dev',
      },
    ];
    for (const spec of specs) {
      await deployFunction(client, {...spec, activate});
    }
  }

  console.log('[deploy] Complete.');
}

main().catch(error => {
  console.error('[deploy] Failed:', error.message);
  process.exitCode = 1;
});
