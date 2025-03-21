import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCommand } from './cmd.js';

import { GLOBAL_PREFIX } from '../ponder.js';


function copyAllFiles(source, dest) {
  if (!fs.existsSync(source)) {
    console.warn(`⚠️ Source directory does not exist: ${source}`);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(source);
  for (const entry of entries) {
    const sourcePath = path.join(source, entry);
    const destPath = path.join(dest, entry);
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      copyAllFiles(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

export async function runComboSetup(projectName, blueprintPath, variantPath, envVars) {
  const networkName = envVars.NETWORK_NAME || `${projectName}_net`;
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName]);
  } catch (e) {
    console.warn(`🟡 network ${networkName} already exists`);
  }

  // Make a temp directory for Docker Compose
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectName}-`));
  console.log(`📁 Using tempDir for unified compose: ${tempDir}`);

  const blueprintDest = path.join(tempDir, 'blueprint');
  copyAllFiles(blueprintPath, blueprintDest);

  const blueprintComposeFile = path.join(blueprintDest, 'docker-compose.yml');
  const blueprintComposeRenamed = path.join(blueprintDest, 'docker-compose.blueprint.yml');
  if (fs.existsSync(blueprintComposeFile)) {
    fs.renameSync(blueprintComposeFile, blueprintComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in blueprint path: ${blueprintPath}`);
  }

  const variantDest = path.join(tempDir, 'variant');
  copyAllFiles(variantPath, variantDest);

  const variantComposeFile = path.join(variantDest, 'docker-compose.yml');
  const variantComposeRenamed = path.join(variantDest, 'docker-compose.variant.yml');
  if (fs.existsSync(variantComposeFile)) {
    fs.renameSync(variantComposeFile, variantComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in variant path: ${variantPath}`);
  }

  const composeArgsBase = [
    'compose',
    '-p', projectName,
    '-f', blueprintComposeRenamed,
    '-f', variantComposeRenamed,
  ];

  await runCommand('docker', [...composeArgsBase, 'down', '-v'], {
    env: { ...process.env, ...envVars },
  });

  await runCommand('docker', [
    ...composeArgsBase,
    'up', '-d',
    '--remove-orphans',
    '--force-recreate',
    '--build',
  ], {
    env: { ...process.env, ...envVars },
  });

  console.log(`✅ Unified Docker Compose for ${projectName} is up!`);
}

export async function runMonitoringSetup() {
  console.log('\n=== Starting monitoring stack ===');

    const baseArgs = [
      'compose',
      '-p', `${GLOBAL_PREFIX}-monitoring`,
      '-f', 'docker-compose.monitoring.yml',
    ];


    await runCommand('docker', ['network', 'create', '--driver', 'bridge', 'monitoring'])
    .catch((err) => {
      if (!String(err.stderr || '').includes('already exists')) {
        console.warn(`🟡 network monitoring already exists`);
      }
    });


    await runCommand('docker', [
      ...baseArgs,
      'up', '-d', '--remove-orphans', '--force-recreate', '--build',
    ], { env: process.env });

    console.log('✅ Monitoring stack is running.');
}
