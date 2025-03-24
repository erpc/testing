import fs from 'fs';
import { spawn } from 'child_process';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🏭 Running: ${command} ${args.join(' ')}`);
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
      console.log(`🔁 Retrying in ${delayMs} ms (attempt ${attempt}/${retries})`);
      await sleep(delayMs);
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function writePrometheus(prometheusScrape, prometheusFile) {
  let content = `
global:
  scrape_interval: 15s

scrape_configs:
`;

  for (const c of prometheusScrape) {
    content += `
  - job_name: ${c.erpcJob}
    static_configs:
      - targets: ['host.docker.internal:${c.erpcPort}']
`;

    content += `
  - job_name: ${c.ponderJob}
    static_configs:
      - targets: ['host.docker.internal:${c.ponderPort}']
`;
  }

  fs.writeFileSync(prometheusFile, content.trim() + '\n', 'utf8');
  console.log(`\n✅ Created ${prometheusFile}`);
}

export function writeGrafanaPanels(grafanaTemplate, grafanaFile) {
  const baseDashboard = JSON.parse(fs.readFileSync(grafanaTemplate, 'utf8'));
  fs.writeFileSync(grafanaFile, JSON.stringify(baseDashboard, null, 2), 'utf8');
  console.log(`✅ Created ${grafanaFile}`);
}
