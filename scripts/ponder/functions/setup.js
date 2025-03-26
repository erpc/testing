import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCommand } from './utils.js';

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
  // Make a temp directory for Docker Compose
  const homeDir = process.env.HOME || os.homedir();
  const tempDir = fs.mkdtempSync(path.join(homeDir, `.docker-tmp-${projectName}-`));
  console.log(`📁 Using tempDir for unified compose: ${tempDir}`);

  // Create a network for the project
  const networkName = envVars.NETWORK_NAME || `${projectName}_net`;
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName], { cwd: tempDir });
  } catch (e) {
    console.warn(`🟡 network ${networkName} already exists`);
  }

  // Copy blueprint files into tempDir
  copyAllFiles(blueprintPath, tempDir);

  // Rename blueprint’s compose file
  const blueprintComposeFile = path.join(tempDir, 'docker-compose.yml');
  const blueprintComposeRenamed = path.join(tempDir, 'docker-compose.blueprint.yml');
  if (fs.existsSync(blueprintComposeFile)) {
    fs.renameSync(blueprintComposeFile, blueprintComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in blueprint path: ${blueprintPath}`);
  }

  // If variant path is provided, copy and rename those files as well
  let variantComposeRenamed = null;
  if (variantPath) {
    copyAllFiles(variantPath, tempDir);

    const variantComposeFile = path.join(tempDir, 'docker-compose.yml');
    variantComposeRenamed = path.join(tempDir, 'docker-compose.variant.yml');
    if (fs.existsSync(variantComposeFile)) {
      fs.renameSync(variantComposeFile, variantComposeRenamed);
    } else {
      console.warn(`⚠️ No docker-compose.yml found in variant path: ${variantPath}`);
      variantComposeRenamed = null; 
    }
  }

  // Build up the docker-compose arguments
  const composeArgsBase = [
    'compose',
    '-p', projectName,
    '-f', blueprintComposeRenamed,
  ];
  if (variantComposeRenamed) {
    composeArgsBase.push('-f', variantComposeRenamed);
  }

  // Bring down any existing containers
  await runCommand('docker', [...composeArgsBase, 'down', '-v'], {
    cwd: tempDir,
    env: { ...process.env, ...envVars },
  });

  // Bring everything up
  await runCommand('docker', [
    ...composeArgsBase,
    'up', '-d',
    '--remove-orphans',
    '--force-recreate',
    '--build',
  ], {
    env: { ...process.env, ...envVars },
    cwd: tempDir,
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
    'up', '-d',
    '--remove-orphans',
    '--force-recreate',
    '--build',
  ], { env: process.env });

  console.log('✅ Monitoring stack is running.');
}
