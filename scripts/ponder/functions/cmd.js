import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * A small Promise wrapper around spawn to run shell commands.
 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
    });
    
    let stdout = '';
    let stderr = '';
    
    if (proc.stdout) {
      proc.stdout.on('data', (data) => (stdout += data.toString()));
    }
    if (proc.stderr) {
      proc.stderr.on('data', (data) => (stderr += data.toString()));
    }
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject({ code, stdout, stderr, message: `Exited with code ${code}` });
      } else {
        resolve({ code, stdout, stderr });
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * A utility to run Docker Compose from a directory with relevant files.
 * 
 * In the simplest scenario, you give it:
 * - A projectName
 * - Path to the local folder that has `docker-compose.yml`
 * - The environment variables
 */
export async function runDockerCompose(projectName, sourceFolder, envVars) {
  // 1) Create or reuse a network
  const networkName = envVars.NETWORK_NAME || `${projectName}_net`;
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName]);
  } catch (e) {
    console.warn(` ⚠️ Could not create network "${networkName}": ${e.message}`);
  }

  // 2) Copy files into a temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectName}-`));
  console.log(`📁 Using tempDir: ${tempDir}`);

  // For simplicity, copy everything – or filter if desired
  copyAllFiles(sourceFolder, tempDir);

  // 3) docker compose down
  const composeArgs = [
    'compose',
    '-p', projectName,
    '-f', path.join(tempDir, 'docker-compose.yml'),
  ];
  await runCommand('docker', [...composeArgs, 'down', '-v'], {
    env: { ...process.env, ...envVars },
  });

  // 4) docker compose up
  await runCommand('docker', [...composeArgs, 'up', '-d', '--remove-orphans', '--force-recreate', '--build'], {
    env: { ...process.env, ...envVars },
  });

  console.log(`✅ Docker Compose for ${projectName} is up!`);
}

/**
 * Recursively copies all files and folders from source to destination
 */
function copyAllFiles(sourceFolder, destFolder) {
  if (!fs.existsSync(sourceFolder)) {
    console.warn(`⚠️ Source folder does not exist: ${sourceFolder}`);
    return;
  }
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }
  
  const entries = fs.readdirSync(sourceFolder);
  entries.forEach((entry) => {
    const sourcePath = path.join(sourceFolder, entry);
    const destPath = path.join(destFolder, entry);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      // Recursively copy directories
      copyAllFiles(sourcePath, destPath);
    } else {
      // Copy all files
      fs.copyFileSync(sourcePath, destPath);
    }
  });
}

/**
 * Retry any async action N times with a delay.
 */
export async function retryAction(action, retries, delayMs, errorMessage) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      await action();
      return;
    } catch (err) {
      console.error(`❌ ${errorMessage}: ${err.message}`);
      attempt++;
      if (attempt >= retries) {
        throw new Error(`${errorMessage} after ${attempt} attempts`);
      }
      console.log(`Retrying in ${delayMs} ms (attempt ${attempt}/${retries})`);
      await sleep(delayMs);
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
