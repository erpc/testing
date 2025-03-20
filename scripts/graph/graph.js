#!/usr/bin/env node

import fs, { copyFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { spawn } from 'child_process';
import os from 'os';

const GLOBAL_PREFIX = "erpc-testing-graph"

// Load environment variables
dotenv.config({
  path: path.resolve('../../.env'),
});

////////////////////////////////////////////////////////////////////////////////
// 1) Load graph.yaml combos
////////////////////////////////////////////////////////////////////////////////
let combos;
try {
  const raw = fs.readFileSync('graph.yaml', 'utf8');
  combos = yaml.load(raw);
  if (!Array.isArray(combos)) {
    throw new Error('graph.yaml is not an array of blueprint–variant combos!');
  }
} catch (err) {
  console.error('❌ Could not parse graph.yaml:', err.message);
  process.exit(1);
}

// 2) Paths for the files we want to overwrite from scratch
const prometheusFile = './monitoring/prometheus/prometheus.yml';
const postgresFile   = './monitoring/grafana/datasources/postgres.yml';
const grafanaTemplate    = './monitoring/grafana/dashboards/grafana.template.json';
const grafanaFile    = './monitoring/grafana/dashboards/grafana.json';

// 3) Data structures for the "generate" part
// Will hold {erpcJob, erpcPort, graphJob, graphPort} entries
const prometheusScrape = [];
// Will hold {dsName, dsPort} entries
const postgresDatasets = [];
// Will hold the new Postgres table panels for Grafana
const newPanels = [];

// Base paths if needed for Docker Compose
const blueprintsBase = '../../blueprints';
const variantsBase   = '../../variants';

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env
    });
    
    let stdout = '';
    let stderr = '';
    
    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }
    
    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
          code,
          stdout,
          stderr,
          message: `Process exited with code ${code}`
        });
      } else {
        resolve({
          code,
          stdout,
          stderr
        });
      }
    });
    
    proc.on('error', (err) => {
      reject({
        command: `${command} ${args.join(' ')}`,
        message: err.toString(),
        error: err
      });
    });
  });
}

async function runDockerCompose(projectName, blueprintPath, variantPath, env, filePatterns = [/\.ya?ml$/, /\.toml$/], ignorePatterns = [/.*node_modules.*/, /.*\.git.*/]) {
  const networkName = env.NETWORK_NAME || `${projectName}_net`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${projectName}-`));
  
  console.log(`📁 Created temporary working directory: ${tempDir}`);

  // Helper function to copy matching files
  function copyMatchingFiles(sourceDir, destDir) {
    if (!fs.existsSync(sourceDir)) {
      console.warn(`⚠️ Source directory does not exist: ${sourceDir}`);
      return;
    }
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Function to recursively process directories
    function processDirectory(currentPath, relativePath = '') {
      const currentFullPath = path.join(sourceDir, relativePath, currentPath);
      const entries = fs.readdirSync(currentFullPath);
      
      for (const entry of entries) {
        const entryPath = path.join(currentFullPath, entry);
        // const entryRelativePath = path.join(relativePath, currentPath, entry);
        const entryDestPath = path.join(destDir, relativePath, currentPath, entry);
        
        if (!fs.statSync(entryPath).isDirectory()) {
          // Check if file matches patterns
          const shouldCopy = filePatterns.some(pattern => pattern.test(entryPath)) && !ignorePatterns.some(pattern => pattern.test(entryPath));
          if (shouldCopy) {
            // Ensure destination directory exists
            const entryDestDir = path.dirname(entryDestPath);
            if (!fs.existsSync(entryDestDir)) {
              fs.mkdirSync(entryDestDir, { recursive: true });
            }
            // Copy file
            fs.copyFileSync(entryPath, entryDestPath);
          }
        }
      }
    }
    
    // Start processing from root directory
    processDirectory('');
  }
  
  // Copy files from blueprint and variant directories
  const fullBlueprintPath = path.resolve(blueprintsBase, blueprintPath);
  const fullVariantPath = path.resolve(variantsBase, variantPath);
  
  copyMatchingFiles(fullBlueprintPath, tempDir);
  copyMatchingFiles(fullVariantPath, tempDir);
  
  // 1) (Re)create the Docker network as external.
  //    For a normal bridge network, we use '--driver bridge'.
  try {
    await runCommand('docker', ['network', 'create', '--driver', 'bridge', networkName], { cwd: tempDir });
  } catch (e) {
    console.warn(` ⚠️ Failed to create network "${networkName}": ${e.message}`);
  }

  copyFileSync(
    path.resolve(blueprintsBase, blueprintPath, 'docker-compose.yml'),
    path.resolve(tempDir, 'docker-compose.blueprint.yml'),
  );
  copyFileSync(
    path.resolve(variantsBase, variantPath, 'docker-compose.yml'),
    path.resolve(tempDir, 'docker-compose.variant.yml'),
  );

  const composeArgsBase = [
    'compose',
    '-p', projectName,
    '-f', path.resolve(tempDir, 'docker-compose.variant.yml'),
    '-f', path.resolve(tempDir, 'docker-compose.blueprint.yml'),
  ];

  // 3) Force remove all volumes and existing containers
  try {
    await runCommand('docker', [
      ...composeArgsBase,
      'down', '-v',
    ], { env: { ...process.env, ...env }, cwd: tempDir });
  } catch (e) {
    console.error(` ⚠️ Failed to remove existing containers for ${projectName}`);
  }

  // 4) Install NPM dependencies
  if (fs.existsSync(path.resolve(fullBlueprintPath, 'package.json'))) {
    try {
      await runCommand('npm', ['install', '--legacy-peer-deps'], { cwd: fullBlueprintPath });
      console.log(`✅ Successfully installed npm dependencies for ${projectName}`);
    } catch (e) {
      throw new Error(`Failed to install npm dependencies for ${projectName}: ${e.message}`);
    }
  } else {
    console.log(`⚠️ No package.json found for ${projectName}, skipping npm install`);
  }

  // 5) Now run docker-compose
  const composeArgs = [
    ...composeArgsBase,
    'up', '-d', '--remove-orphans', '--force-recreate', '--build',
  ];

  try {
    await runCommand('docker', composeArgs, {
      cwd: tempDir,
      env: { ...process.env, ...env },
    });
    console.log(`✅ Successfully started ${projectName}`);
  } catch (e) {
    throw new Error(`docker compose up failed for ${projectName}: ${e.message}`);
  }
}

////////////////////////////////////////////////////////////////////////////////
// 4) GENERATE: Loop combos to build environment (Prometheus + Postgres + Grafana)
////////////////////////////////////////////////////////////////////////////////
async function generateEnvironment() {
  let comboIndex = 0;
  for (const combo of combos) {
    await (async (combo, comboIndex) => {
      const { blueprint, variant, environment } = combo;
      if (!blueprint || !variant) {
        console.warn('Skipping combo missing blueprint or variant:', combo);
        return;
      }

      // Safe project name
      const projectName   = `${GLOBAL_PREFIX}-combo-${comboIndex}`;

      // Docker environment ports
      const envVars = {
        NETWORK_NAME: `${projectName}_net`,
        POSTGRES_PORT: 7000 + comboIndex,
        IPFS_PORT: 7100 + comboIndex,
        GRAPH_NODE_PORT1: 7200 + comboIndex,
        GRAPH_NODE_PORT2: 7300 + comboIndex,
        GRAPH_NODE_PORT3: 7400 + comboIndex,
        GRAPH_NODE_PORT4: 7500 + comboIndex,
        GRAPH_NODE_PORT5: 7600 + comboIndex,
        ELASTICSEARCH_PORT: 7700 + comboIndex,
        ERPC_HTTP_PORT: 7800 + comboIndex,
        ERPC_METRICS_PORT: 7900 + comboIndex,
        ERPC_PPROF_PORT: 8000 + comboIndex,
        ...environment,
        ...process.env,
      };

      // 4a) Spin up Docker containers
      console.log(`\n=== Starting ${projectName} with offset ${comboIndex} ===`);
      try {
        await runDockerCompose(projectName, blueprint, variant, envVars);
      } catch (e) {
        console.error(`❌ ${e.message}`);
        process.exit(1);
      }

      // 4b) Prometheus scrape config
      prometheusScrape.push({
        erpcJob:  `erpc-${projectName}`,
        erpcPort: envVars.ERPC_METRICS_PORT,
        graphJob: `graph-node-${projectName}`,
        graphPort: envVars.GRAPH_NODE_PORT5,
      });

      // 4c) Postgres DS info
      const dsName = `Postgres-${projectName}`;
      const dsPort = envVars.POSTGRES_PORT;
      postgresDatasets.push({ dsName, dsPort });

      // 4d) Build 2 new "Deployments" / "Errors" panels for Grafana
      const deploymentSQL = `
    SELECT
      d.deployment,
      i.name,
      d.failed,
      d.latest_ethereum_block_number,
      d.entity_count,
      d.reorg_count,
      d.current_reorg_depth,
      d.max_reorg_depth,
      d.health,
      -- Safely extract synced_at if it exists, NULL otherwise
      (to_jsonb(d)->>'synced_at')::timestamptz AS synced_at
    FROM subgraphs.subgraph_deployment d
    JOIN info.subgraph_info i ON i.subgraph = d.deployment
    ORDER BY d.deployment DESC
    LIMIT 100;
    `.trim();

      const errorsSQL = `
    SELECT
      e.subgraph_id,
      i.name,
      e.message,
      e.block_range,
      e.deterministic,
      e.created_at
    FROM subgraphs.subgraph_error e
    JOIN info.subgraph_info i ON i.subgraph = e.subgraph_id
    ORDER BY e.created_at DESC
    LIMIT 100;`.trim();

      const nextPanelId = newPanels.length * 2 + 1;
      const nextPanelIdErr = nextPanelId + 1;

      newPanels.push({
        id: nextPanelId,
        type: 'table',
        title: `Deployments (${projectName})`,
        gridPos: { h: 5, w: 24, x: 0, y: 0 },
        datasource: {
          type: 'grafana-postgresql-datasource',
          uid: dsName,
        },
        targets: [
          {
            refId: 'A',
            format: 'table',
            rawQuery: true,
            rawSql: deploymentSQL,
          },
        ],
      });

      newPanels.push({
        id: nextPanelIdErr,
        type: 'table',
        title: `Errors (${projectName})`,
        gridPos: { h: 7, w: 24, x: 0, y: 0 },
        datasource: {
          type: 'grafana-postgresql-datasource',
          uid: dsName,
        },
        targets: [
          {
            refId: 'A',
            format: 'table',
            rawQuery: true,
            rawSql: errorsSQL,
          },
        ],
      });
    })(combo, comboIndex);
    comboIndex += 1;
  }

  // 4e) Now write out Prometheus, Postgres DS, and append to Grafana JSON

  // 4e-1) Write Prometheus
  {
    let content = `global:
  scrape_interval: 15s

scrape_configs:
`;
  for (const c of prometheusScrape) {
    content += `
  - job_name: ${c.erpcJob}
    static_configs:
      - targets: ['host.docker.internal:${c.erpcPort}']

  - job_name: ${c.graphJob}
    static_configs:
      - targets: ['host.docker.internal:${c.graphPort}']
`;
    }

    fs.writeFileSync(prometheusFile, content.trim() + '\n', 'utf8');
    console.log(`\n✅ Wrote fresh ${prometheusFile}`);
  }

  // 4e-2) Write Postgres datasources
  {
    let content = `apiVersion: 1
datasources:
  `;
    for (const ds of postgresDatasets) {
      content += `
    - name: ${ds.dsName}
      type: postgres
      url: host.docker.internal:${ds.dsPort}
      uid: ${ds.dsName}
      user: graph-node
      secureJsonData:
        password: let-me-in
      jsonData:
        database: graph-node
        sslmode: 'disable'
        maxOpenConns: 100
        maxIdleConns: 100
        maxIdleConnsAuto: true
        connMaxLifetime: 14400
        postgresVersion: 903
        timescaledb: false
  `;
    }

    fs.writeFileSync(postgresFile, content.trim() + '\n', 'utf8');
    console.log(`✅ Wrote fresh ${postgresFile}`);
  }

  // 4e-3) Append new panels to Grafana dashboard (if they don't exist yet)
  {
    const baseDashboard = JSON.parse(fs.readFileSync(grafanaTemplate, 'utf8'));
    console.log('ℹ️  Creating new minimal dashboard skeleton');

    for (const p of newPanels) {
      const alreadyExists = baseDashboard.panels.find(
        (panel) => panel.title === p.title
      );
      if (alreadyExists) {
        console.log(`⚠️  Skipping panel "${p.title}" (already exists)`);
        continue;
      }
      baseDashboard.panels.push(p);
    }

    fs.writeFileSync(grafanaFile, JSON.stringify(baseDashboard, null, 2), 'utf8');
    console.log(`✅ Updated ${grafanaFile} with Postgres panels (no duplicates)`);
  }
}

////////////////////////////////////////////////////////////////////////////////
// 5) DEPLOY: For each combo, actually do "graph create" / "graph deploy"
////////////////////////////////////////////////////////////////////////////////

generateEnvironment().then(async () => {
  console.log('\n=== Environment generated, waiting 10 seconds before deploying subgraphs ===');
  await new Promise(resolve => setTimeout(resolve, 10000));

  const promises = [];
  for (let comboIndex = 0; comboIndex < combos.length; comboIndex++) {
    promises.push((async (comboIndex) => {
      const { blueprint, variant, environment } = combos[comboIndex];
      if (!blueprint || !variant) {
        console.warn(`Skipping subgraph entry #${comboIndex}: missing blueprint or variant`);
        return;
      }

      const subgraphName = `${GLOBAL_PREFIX}-combo-${comboIndex}`;
      const nodeUrlPort = 7400 + comboIndex;
      // const ipfsPort    = 7100 + comboIndex;

      const nodeUrl = `http://localhost:${nodeUrlPort}`;
      // const ipfsUrl = `http://localhost:${ipfsPort}`;
      const ipfsUrl = `http://localhost:5001`;

      const subgraphFolder = path.resolve('../../blueprints', blueprint);

      console.log(`\n=== Deploying Subgraph: ${subgraphName} (node=${nodeUrl}) ===`);

      if (!fs.existsSync(subgraphFolder)) {
        console.error(`❌ Subgraph folder not found: ${subgraphFolder}`);
        return;
      }

      // 5a) npm install
      if (fs.existsSync(path.resolve(subgraphFolder, 'package.json'))) {
        console.log(`Installing dependencies in ${subgraphFolder}...`);
        try {
          await runCommand('npm', ['install', '--legacy-peer-deps'], { cwd: subgraphFolder });
        } catch (e) {
          console.error(`❌ Failed npm install for "${subgraphName}": ${e.message}`);
          process.exit(1);
        }

        // 5b) graph codegen
        try {
          console.log(`\nGenerating types for ${subgraphName}...`);
          await runCommand('graph', ['--version'], { cwd: subgraphFolder });
          await runCommand('graph', ['codegen', '--output-dir', 'src/types/'], { cwd: subgraphFolder });
        } catch (e) {
          console.error(`⚠️ Failed codegen for "${subgraphName}": ${e.message}`);
        }
      } else {
        console.log(`⚠️ No package.json found for ${subgraphName}, skipping npm install`);
      }

      // 5c) graph create
      console.log(`\nCreating subgraph on node: ${nodeUrl}`);
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await new Promise((resolve, reject) => {
            const createProcess = spawn('graph', ['create', subgraphName, '--node', nodeUrl], {
              stdio: 'inherit',
              cwd: subgraphFolder,
              env: { ...process.env, ...environment },
            });
            
            createProcess.on('close', (code) => {
              if (code !== 0) {
                reject(new Error(`Process exited with code ${code}`));
              } else {
                resolve();
              }
            });
            
            createProcess.on('error', (err) => {
              reject(err);
            });
          });
          break;
        } catch (e) {
          console.error(`❌ Failed to create subgraph "${subgraphName}": ${e.message}`);
          if (attempt === 29) {
            process.exit(1);
          } else {
            console.log(`Retrying after 5 seconds... (attempt ${attempt + 1} of 10)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      // 5d) graph deploy
      console.log(`\nDeploying "${subgraphName}" to ${nodeUrl}...`);
      for (let attempt = 0; attempt < 30; attempt++) {
        let deployArgs = [
          'deploy',
          subgraphName,
          'subgraph.yaml',
          '--ipfs', ipfsUrl,
          '--node', nodeUrl,
          '--version-label', '0.0.1',
        ];
        if (fs.existsSync(path.resolve(subgraphFolder, 'ipfs.txt'))) {
          deployArgs = [
            'deploy',
            subgraphName,
            '--ipfs', ipfsUrl,
            '--node', nodeUrl,
            '--version-label', '0.0.1',
            '--ipfs-hash', fs.readFileSync(path.resolve(subgraphFolder, 'ipfs.txt'), 'utf8').trim(),
          ]
        }
        try {
          await Promise.race([
            new Promise((resolve, reject) => {
              console.log(`Running: graph ${deployArgs.join(' ')}`);
              const deployProcess = spawn(
                'graph',
                deployArgs,
                {
                  stdio: 'inherit',
                  cwd: subgraphFolder,
                  env: { ...process.env, ...environment },
                }
              );
              
              deployProcess.on('close', (code) => {
                if (code !== 0) {
                  reject(new Error(`Process exited with code ${code}`));
                } else {
                  resolve();
                }
              });
              
              deployProcess.on('error', (err) => {
                reject(new Error(`${err.toString()}`));
              });
            }),
            new Promise((resolve, reject) => {
              setTimeout(() => {
                reject(new Error('Timeout creating subgraph!'));
              }, 30_000);
            })
          ]);
          break;
        } catch (e) {
          console.error(`❌ Failed to finish deploying subgraph "${subgraphName}": ${e.message}`);
          if (attempt === 29) {
            process.exit(1);
          } else {
            console.log(`Retrying after 5 seconds... (attempt ${attempt + 1} of 30)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      console.log(`✅ Successfully deployed: ${subgraphName}`);
    })(comboIndex).catch((e) => {
      console.error(`❌ Failed to run deploy subgraph "${e?.message || JSON.stringify(e)}"`);
    }));
  }

  await Promise.all(promises);

  // Now run the monitoring stack
  {
    console.log('\n=== Starting monitoring stack ===');
    const baseArgs = [
      'compose',
      '-p', `${GLOBAL_PREFIX}-monitoring`,
      '-f', 'docker-compose.monitoring.yml',
    ];
    await runCommand('docker', [
      ...baseArgs,
      'up', '-d', '--remove-orphans', '--force-recreate', '--build',
    ], { env: process.env });
    console.log('✅ Monitoring stack is running.');
  }
}).then(() => {
  console.log('\n✅ Environment generated + all subgraphs deployed!');
}).catch((e) => {
  console.error(`❌ Failed to generate environment: ${e?.message || JSON.stringify(e)}`);
  process.exit(1);
});
