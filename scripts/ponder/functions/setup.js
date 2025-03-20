import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCommand } from './cmd.js';

/**
 * Recursively copies all files & folders from `source` into `dest`.
 */
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

/**
 * Merges the blueprint's and variant's entire contents (including docker-compose.yml)
 * into one ephemeral folder, then calls Docker Compose once under a unified project name.
 */
export async function runUnifiedSetup(projectName, blueprintPath, variantPath, envVars) {
  // 1) Create or reuse a Docker network
  const networkName = envVars.NETWORK_NAME || `${projectName}_net`;
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName]);
  } catch (e) {
    console.warn(` ⚠️ Could not create network "${networkName}": ${e.message}`);
  }

  // 2) Make a temp directory for Docker Compose
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectName}-`));
  console.log(`📁 Using tempDir for unified compose: ${tempDir}`);

  // 3) Copy the entire blueprint folder
  const blueprintDest = path.join(tempDir, 'blueprint');
  copyAllFiles(blueprintPath, blueprintDest);

  // 4) Rename the blueprint's docker-compose.yml -> docker-compose.blueprint.yml
  const blueprintComposeFile = path.join(blueprintDest, 'docker-compose.yml');
  const blueprintComposeRenamed = path.join(blueprintDest, 'docker-compose.blueprint.yml');
  if (fs.existsSync(blueprintComposeFile)) {
    fs.renameSync(blueprintComposeFile, blueprintComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in blueprint path: ${blueprintPath}`);
  }

  // 5) Copy the entire variant folder
  const variantDest = path.join(tempDir, 'variant');
  copyAllFiles(variantPath, variantDest);

  // 6) Rename the variant's docker-compose.yml -> docker-compose.variant.yml
  const variantComposeFile = path.join(variantDest, 'docker-compose.yml');
  const variantComposeRenamed = path.join(variantDest, 'docker-compose.variant.yml');
  if (fs.existsSync(variantComposeFile)) {
    fs.renameSync(variantComposeFile, variantComposeRenamed);
  } else {
    console.warn(`⚠️ No docker-compose.yml found in variant path: ${variantPath}`);
  }

  // 7) Build the final list of Compose files
  // We'll reference them directly in their subdirectories (blueprint/variant).
  const composeArgsBase = [
    'compose',
    '-p', projectName,
    '-f', blueprintComposeRenamed,
    '-f', variantComposeRenamed,
  ];

  // 8) "down -v" if you want a fresh start each time
  await runCommand('docker', [...composeArgsBase, 'down', '-v'], {
    env: { ...process.env, ...envVars },
  });

  // 9) "up -d --remove-orphans --force-recreate --build"
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
