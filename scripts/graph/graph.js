#!/usr/bin/env node

import fs, { copyFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { spawnSync } from 'child_process';
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

// We'll track a port offset for the Docker environment
let envOffset = 0;
let comboIndex = 0;

////////////////////////////////////////////////////////////////////////////////
// Helper: run Docker Compose
////////////////////////////////////////////////////////////////////////////////
function runDockerCompose(projectName, blueprintPath, variantPath, env, filePatterns = [/\.ya?ml$/, /\.toml$/], ignorePatterns = [/.*node_modules.*/, /.*\.git.*/]) {
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
  
  // 1) Remove any existing Docker network
  spawnSync('docker', ['network', 'rm', networkName], { stdio: 'inherit', cwd: tempDir });

  // 2) (Re)create the Docker network as external.
  //    For a normal bridge network, we use '--driver bridge'.
  spawnSync('docker', ['network', 'create', '--driver', 'bridge', networkName], {
    stdio: 'inherit',
    cwd: tempDir,
  });

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
    spawnSync('docker', [
      ...composeArgsBase,
      'down', '-v',
    ], { stdio: 'inherit', env: { ...process.env, ...env }, cwd: tempDir });
  } catch (e) {
    console.error(` ⚠️ Failed to remove existing containers for ${projectName}`);
  }

  // 4) Install NPM dependencies
  const installResult = spawnSync('npm', ['install', '--legacy-peer-deps'], {
    stdio: 'inherit',
    cwd: fullBlueprintPath,
  });
  if (installResult.status !== 0) {
    throw new Error(`Failed to install npm dependencies for ${projectName}`);
  }
  console.log(`✅ Successfully installed npm dependencies for ${projectName}`);

  // 5) Now run docker-compose
  const composeArgs = [
    ...composeArgsBase,
    'up', '-d', '--remove-orphans', '--force-recreate', '--build',
  ];

  const result = spawnSync('docker', composeArgs, {
    stdio: 'inherit',
    cwd: tempDir,
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(`docker compose up failed for ${projectName}`);
  }

  console.log(`✅ Successfully started ${projectName}`);
}

////////////////////////////////////////////////////////////////////////////////
// 4) GENERATE: Loop combos to build environment (Prometheus + Postgres + Grafana)
////////////////////////////////////////////////////////////////////////////////
for (const combo of combos) {
  const { blueprint, variant, environment } = combo;
  if (!blueprint || !variant) {
    console.warn('Skipping combo missing blueprint or variant:', combo);
    continue;
  }

  // Safe project name
  const projectName   = `${GLOBAL_PREFIX}-combo-${comboIndex}`;

  // Docker environment ports
  const envVars = {
    NETWORK_NAME: `${projectName}_net`,
    POSTGRES_PORT: 5432 + envOffset,
    IPFS_PORT: 5001 + envOffset,
    GRAPH_NODE_PORT1: 8000 + envOffset,
    GRAPH_NODE_PORT2: 8001 + envOffset,
    GRAPH_NODE_PORT3: 8020 + envOffset,
    GRAPH_NODE_PORT4: 8030 + envOffset,
    GRAPH_NODE_PORT5: 8040 + envOffset,
    ELASTICSEARCH_PORT: 9200 + envOffset,
    ERPC_HTTP_PORT: 4000 + envOffset,
    ERPC_METRICS_PORT: 4001 + envOffset,
    ERPC_PPROF_PORT: 6000 + envOffset,
    ...environment,
    ...process.env,
  };
  envOffset += 100;
  comboIndex += 1;

  // 4a) Spin up Docker containers
  console.log(`\n=== Starting ${projectName} with offset ${envOffset - 100} ===`);
  try {
    runDockerCompose(projectName, blueprint, variant, envVars);
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
  d.synced_at
FROM subgraphs.subgraph_deployment d
JOIN info.subgraph_info i ON i.subgraph = d.deployment
ORDER BY d.deployment DESC
LIMIT 100;`.trim();

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

////////////////////////////////////////////////////////////////////////////////
// 5) DEPLOY: For each combo, actually do "graph create" / "graph deploy"
////////////////////////////////////////////////////////////////////////////////

let subgraphOffset = 0;

for (let comboIndex = 0; comboIndex < combos.length; comboIndex++) {
  const { blueprint, variant, environment } = combos[comboIndex];
  if (!blueprint || !variant) {
    console.warn(`Skipping subgraph entry #${comboIndex}: missing blueprint or variant`);
    continue;
  }

  const subgraphName = `${GLOBAL_PREFIX}-combo-${comboIndex}`;
  const nodeUrlPort = 8020 + subgraphOffset;
  const ipfsPort    = 5001 + subgraphOffset;

  const nodeUrl = `http://localhost:${nodeUrlPort}`;
  const ipfsUrl = `http://localhost:${ipfsPort}`;

  const subgraphFolder = path.resolve('../../blueprints', blueprint);

  console.log(`\n=== Deploying Subgraph: ${subgraphName} (node=${nodeUrl}) ===`);

  if (!fs.existsSync(subgraphFolder)) {
    console.error(`❌ Subgraph folder not found: ${subgraphFolder}`);
    continue;
  }

  // 5a) npm install
  console.log(`Installing dependencies in ${subgraphFolder}...`);
  const installResult = spawnSync('npm', ['install', '--legacy-peer-deps'], {
    stdio: 'inherit',
    cwd: subgraphFolder,
  });
  if (installResult.status !== 0) {
    console.error(`❌ Failed npm install for "${subgraphName}"`);
    process.exit(installResult.status);
  }

  // 5b) graph codegen
  console.log(`\nGenerating types for ${subgraphName}...`);
  const codegenResult = spawnSync('graph', ['codegen', '--output-dir', 'src/types/'], {
    stdio: 'inherit',
    cwd: subgraphFolder,
  });
  if (codegenResult.status !== 0) {
    console.error(`❌ Failed codegen for "${subgraphName}"`);
    process.exit(codegenResult.status);
  }

  // 5c) graph create
  console.log(`\nCreating subgraph on node: ${nodeUrl}`);
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const createResult = spawnSync('graph', ['create', subgraphName, '--node', nodeUrl], {
        stdio: 'inherit',
        cwd: subgraphFolder,
        env: { ...process.env, ...environment },
      });
      if (createResult.status !== 0) {
        throw new Error(`${createResult?.error?.toString()} ${createResult?.stderr?.toString()} ${createResult?.stdout?.toString()}`);
      }
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
    try {
      const deployResult = spawnSync(
        'graph',
        [
          'deploy',
          subgraphName,
          'subgraph.yaml',
          '--ipfs', ipfsUrl,
          '--node', nodeUrl,
          '--version-label', '0.0.1',
        ],
        {
          stdio: 'inherit',
          cwd: subgraphFolder,
          env: { ...process.env, ...environment },
        }
      );
      if (deployResult.status !== 0) {
        throw new Error(`${deployResult?.error?.toString()} ${deployResult?.stderr?.toString()} ${deployResult?.stdout?.toString()}`);
      }
      break;
    } catch (e) {
      console.error(`❌ Failed to deploy subgraph "${subgraphName}": ${e.message}`);
      if (attempt === 29) {
        process.exit(1);
      } else {
        console.log(`Retrying after 5 seconds... (attempt ${attempt + 1} of 30)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log(`✅ Successfully deployed: ${subgraphName}`);

  subgraphOffset += 100;
}

// Now run the monitoring stack
{
  console.log('\n=== Starting monitoring stack ===');
  const baseArgs = [
    'compose',
    '-p', `${GLOBAL_PREFIX}-monitoring`,
    '-f', 'docker-compose.monitoring.yml',
  ];
  try {
    spawnSync('docker', [
      ...baseArgs,
      'down', '-v',
    ], { stdio: 'inherit', env: process.env });
  } catch (e) {
    console.error(' ⚠️ Failed to remove existing containers for monitoring stack');
  }
  const monitoringResult = spawnSync(
    'docker',
    [
      ...baseArgs,
      'up', '-d', '--remove-orphans', '--force-recreate', '--build',
    ],
    { stdio: 'inherit', env: process.env }
  );
  if (monitoringResult.status !== 0) {
    console.error('❌ Failed to start monitoring stack with docker-compose.monitoring.yml');
    process.exit(monitoringResult.status);
  }
  console.log('✅ Monitoring stack is running.');
}

console.log('\n✅ Environment generated + all subgraphs deployed!');
