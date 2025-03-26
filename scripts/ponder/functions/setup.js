import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCommand } from './utils.js';

import { GLOBAL_PREFIX } from '../ponder.js';

<<<<<<< HEAD
=======

>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
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

<<<<<<< HEAD
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

  // Copy blueprint files into the same tempDir
  copyAllFiles(blueprintPath, tempDir);

  // Rename docker-compose.yml from blueprint to docker-compose.blueprint.yml
  const blueprintComposeFile = path.join(tempDir, 'docker-compose.yml');
  const blueprintComposeRenamed = path.join(tempDir, 'docker-compose.blueprint.yml');
=======
export async function runUnifiedSetup(projectName, blueprintPath, variantPath, envVars) {
  const networkName = envVars.NETWORK_NAME || `${projectName}_net`;
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName]);
  } catch (e) {
    console.warn(` ⚠️ Could not create network "${networkName}": ${e.message}`);
  }

  // Make a temp directory for Docker Compose
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectName}-`));
  console.log(`📁 Using tempDir for unified compose: ${tempDir}`);

  const blueprintDest = path.join(tempDir, 'blueprint');
  copyAllFiles(blueprintPath, blueprintDest);

  const blueprintComposeFile = path.join(blueprintDest, 'docker-compose.yml');
  const blueprintComposeRenamed = path.join(blueprintDest, 'docker-compose.blueprint.yml');
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
  if (fs.existsSync(blueprintComposeFile)) {
    fs.renameSync(blueprintComposeFile, blueprintComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in blueprint path: ${blueprintPath}`);
  }

<<<<<<< HEAD
  // Copy variant files into the same tempDir
  copyAllFiles(variantPath, tempDir);

  // Rename docker-compose.yml from variant to docker-compose.variant.yml
  const variantComposeFile = path.join(tempDir, 'docker-compose.yml');
  const variantComposeRenamed = path.join(tempDir, 'docker-compose.variant.yml');
=======
  const variantDest = path.join(tempDir, 'variant');
  copyAllFiles(variantPath, variantDest);

  const variantComposeFile = path.join(variantDest, 'docker-compose.yml');
  const variantComposeRenamed = path.join(variantDest, 'docker-compose.variant.yml');
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
  if (fs.existsSync(variantComposeFile)) {
    fs.renameSync(variantComposeFile, variantComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in variant path: ${variantPath}`);
  }

<<<<<<< HEAD
  // Build the base arguments for docker-compose
=======
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
  const composeArgsBase = [
    'compose',
    '-p', projectName,
    '-f', blueprintComposeRenamed,
    '-f', variantComposeRenamed,
  ];

<<<<<<< HEAD
  // Bring down (if any are running), remove volumes
=======
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
  await runCommand('docker', [...composeArgsBase, 'down', '-v'], {
    cwd: tempDir,
    env: { ...process.env, ...envVars },
  });

<<<<<<< HEAD
  // Bring everything back up
=======
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
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
