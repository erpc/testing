#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { spawnSync } from 'child_process';

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
function runDockerCompose(projectName, blueprintPath, variantPath, env) {
  const networkName = env.NETWORK_NAME || `${projectName}_net`;

  // 1) Remove any existing Docker network
  spawnSync('docker', ['network', 'rm', networkName], { stdio: 'ignore' });

  // 2) (Re)create the Docker network as external.
  //    For a normal bridge network, we use '--driver bridge'.
  spawnSync('docker', ['network', 'create', '--driver', 'bridge', networkName], {
    stdio: 'ignore',
  });

  // 3) Force remvoe all volumes and existing containers
  try {
    spawnSync('docker', ['compose', '-p', projectName, 'down', '-v'], { stdio: 'inherit' });
  } catch (e) {
    console.error(` ⚠️ Failed to remove existing containers for ${projectName}`);
  }

  // 4) Now run docker-compose, which references that external network
  const composeArgs = [
    'compose',
    '-p', projectName,
    '-f', path.resolve(blueprintsBase, blueprintPath, 'docker-compose.yml'),
    '-f', path.resolve(variantsBase, variantPath, 'docker-compose.yml'),
    'up', '-d', '--remove-orphans', '--force-recreate', '--build',
  ];

  const result = spawnSync('docker', composeArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(`docker compose up failed for ${projectName}`);
  }
}

////////////////////////////////////////////////////////////////////////////////
// 4) GENERATE: Loop combos to build environment (Prometheus + Postgres + Grafana)
////////////////////////////////////////////////////////////////////////////////
for (const combo of combos) {
  const { blueprint, variant } = combo;
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
  const baseDashboard = {
    title: 'Auto-Generated Dashboard',
    schemaVersion: 40,
    version: 1,
    panels: [],
  };
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
  const { blueprint, variant } = combos[comboIndex];
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
  const createResult = spawnSync('graph', ['create', subgraphName, '--node', nodeUrl], {
    stdio: 'inherit',
    cwd: subgraphFolder,
  });
  if (createResult.status !== 0) {
    console.error(`❌ Failed to create subgraph "${subgraphName}"`);
    process.exit(createResult.status);
  }

  // 5d) graph deploy
  console.log(`\nDeploying "${subgraphName}" to ${nodeUrl}...`);
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
    }
  );
  if (deployResult.status !== 0) {
    console.error(`❌ Failed to deploy subgraph "${subgraphName}"`);
    process.exit(deployResult.status);
  }

  console.log(`✅ Successfully deployed: ${subgraphName}`);

  subgraphOffset += 100;
}

// Now run the monitoring stack
{
  console.log('\n=== Starting monitoring stack ===');
  const monitoringResult = spawnSync(
    'docker',
    [
      'compose',
      '-p', `${GLOBAL_PREFIX}-monitoring`,
      '-f', 'docker-compose.monitoring.yml',
      'up', '-d', '--remove-orphans', '--force-recreate', '--build',
    ],
    { stdio: 'inherit' }
  );
  if (monitoringResult.status !== 0) {
    console.error('❌ Failed to start monitoring stack with docker-compose.monitoring.yml');
    process.exit(monitoringResult.status);
  }
  console.log('✅ Monitoring stack is running.');
}

console.log('\n✅ Environment generated + all subgraphs deployed!');
