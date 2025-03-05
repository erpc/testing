#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { spawnSync } from 'child_process';

// 1) Load graph.yaml combos
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

// 2) Paths for Prometheus, Postgres DS, Grafana
const prometheusFile = './monitoring/prometheus/prometheus.yml';
const postgresFile   = './monitoring/grafana/datasources/postgres.yml';
const grafanaFile    = './monitoring/grafana/dashboards/grafana.json';

// 3) Data structures (for “generate” portion)
const prometheusScrape = [];
const postgresDatasets = [];
const newPanels = [];

// 4) Docker Compose base
const blueprintsBase = '../../blueprints';
const variantsBase   = '../../variants';
let envOffset = 0;

// -----------------------------------------------------------------------------
// Helper: tear down an existing environment for a given combo
// -----------------------------------------------------------------------------
function runDockerComposeDown(projectName, blueprintPath, variantPath) {
  const composeArgs = [
    '-p', projectName,
    '-f', path.join(blueprintsBase, blueprintPath, 'docker-compose.yml'),
    '-f', path.join(variantsBase,   variantPath,   'docker-compose.yml'),
    'down',
    '-v',            // remove named volumes declared by the Compose file
    '--rmi', 'all',  // remove images used by services
    '--remove-orphans'
  ];
  const result = spawnSync('docker-compose', composeArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.warn(`⚠️  Could not fully remove environment for ${projectName} — continuing.`);
  }
}

// -----------------------------------------------------------------------------
// Helper: bring environment up for a given combo
// -----------------------------------------------------------------------------
function runDockerComposeUp(projectName, blueprintPath, variantPath, env) {
  const finalEnv = { ...process.env, ...env };
  const composeArgs = [
    '-p', projectName,
    '-f', path.join(blueprintsBase, blueprintPath, 'docker-compose.yml'),
    '-f', path.join(variantsBase,   variantPath,   'docker-compose.yml'),
    'up', '-d'
  ];
  const result = spawnSync('docker-compose', composeArgs, {
    stdio: 'inherit',
    env: finalEnv
  });
  if (result.status !== 0) {
    throw new Error(`docker-compose up failed for ${projectName}`);
  }
}

// -----------------------------------------------------------------------------
// 5) GENERATE environment for each combo
// -----------------------------------------------------------------------------
for (const combo of combos) {
  const { blueprint, variant } = combo;
  if (!blueprint || !variant) {
    console.warn('Skipping combo missing blueprint or variant:', combo);
    continue;
  }

  // Safe project name
  const blueprintName = path.basename(blueprint);
  const safeVariant   = variant.replace(/\//g, '-');
  const projectName   = `${blueprintName}-${safeVariant}`;

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
    ERPC_METRICS_PORT: 4001 + envOffset
  };
  envOffset += 100;

  // 5a) Cleanup old environment for this combo
  console.log(`\n--- Cleaning up old environment for ${projectName} ---`);
  runDockerComposeDown(projectName, blueprint, variant);

  // 5b) Spin up fresh Docker containers
  console.log(`\n=== Starting ${projectName} with offset ${envOffset-100} ===`);
  try {
    runDockerComposeUp(projectName, blueprint, variant, envVars);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  // 5c) Prepare Prometheus scrape config
  prometheusScrape.push({
    erpcJob:  `erpc-${projectName}`,
    erpcPort: envVars.ERPC_METRICS_PORT,
    graphJob: `graph-node-${projectName}`,
    graphPort: envVars.GRAPH_NODE_PORT5
  });

  // 5d) Postgres DS info
  const dsName = `Postgres-${projectName}`;
  const dsPort = envVars.POSTGRES_PORT;
  postgresDatasets.push({ dsName, dsPort });

  // 5e) Build new table panels for Grafana
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
LIMIT 100;
`.trim();

  // We'll just create 2 panels per combo
  const nextPanelId    = newPanels.length * 2 + 1;
  const nextPanelIdErr = nextPanelId + 1;

  newPanels.push({
    id: nextPanelId,
    type: 'table',
    title: `Deployments (${projectName})`,
    gridPos: { h: 5, w: 24, x: 0, y: 0 },
    datasource: {
      type: 'grafana-postgresql-datasource',
      uid: dsName
    },
    targets: [
      {
        refId: 'A',
        format: 'table',
        rawQuery: true,
        rawSql: deploymentSQL
      }
    ]
  });

  newPanels.push({
    id: nextPanelIdErr,
    type: 'table',
    title: `Errors (${projectName})`,
    gridPos: { h: 7, w: 24, x: 0, y: 0 },
    datasource: {
      type: 'grafana-postgresql-datasource',
      uid: dsName
    },
    targets: [
      {
        refId: 'A',
        format: 'table',
        rawQuery: true,
        rawSql: errorsSQL
      }
    ]
  });
}

// -----------------------------------------------------------------------------
// 6) Write Prometheus config
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 7) Write Postgres datasources
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 8) Append new panels to Grafana JSON
// -----------------------------------------------------------------------------
{
  let baseDashboard;
  if (fs.existsSync(grafanaFile)) {
    baseDashboard = JSON.parse(fs.readFileSync(grafanaFile, 'utf8'));
    console.log(`ℹ️  Loaded existing ${grafanaFile}`);
  } else {
    baseDashboard = {
      title: "Auto-Generated Dashboard",
      schemaVersion: 40,
      version: 1,
      panels: []
    };
    console.log(`ℹ️  Creating new minimal dashboard skeleton`);
  }

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

// -----------------------------------------------------------------------------
// 9) Clean up + Bring up monitoring stack
// -----------------------------------------------------------------------------
{
  console.log("\n--- Stopping old monitoring stack ---");
  spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.monitoring.yml', 'down', '-v', '--rmi', 'all', '--remove-orphans'],
    { stdio: 'inherit' }
  );
  console.log("✅ Old monitoring stack removed.");

  console.log("\n=== Starting fresh monitoring stack ===");
  const monitoringResult = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.monitoring.yml', 'up', '-d'],
    { stdio: 'inherit' }
  );
  if (monitoringResult.status !== 0) {
    console.error("❌ Failed to start monitoring stack with docker-compose.monitoring.yml");
    process.exit(monitoringResult.status);
  }
  console.log("✅ Monitoring stack is running.");
}

// -----------------------------------------------------------------------------
// 10) Deploy subgraphs
// -----------------------------------------------------------------------------
let subgraphOffset = 0;

for (let i = 0; i < combos.length; i++) {
  const { blueprint, variant } = combos[i];
  if (!blueprint || !variant) {
    console.warn(`Skipping subgraph entry #${i}: missing blueprint or variant`);
    continue;
  }

  // Convert variant e.g. 'latest/no-config-defaults' -> 'latest_no_config_defaults'
  const safeVariant = variant.replace(/\//g, '_');
  const blueprintBase = path.basename(blueprint);
  const subgraphName = `${blueprintBase}-${safeVariant}`;

  // Use the same offset approach for the subgraph node
  const nodeUrlPort = 8020 + subgraphOffset;
  const ipfsPort    = 5001 + subgraphOffset;
  const nodeUrl = `http://localhost:${nodeUrlPort}`;
  const ipfsUrl = `http://localhost:${ipfsPort}`;

  // Path to blueprint folder
  const subgraphFolder = path.resolve('../../blueprints', blueprint);

  console.log(`\n=== Deploying Subgraph: ${subgraphName} (node=${nodeUrl}) ===`);

  if (!fs.existsSync(subgraphFolder)) {
    console.error(`❌ Subgraph folder not found: ${subgraphFolder}`);
    continue;
  }

  // (a) npm install
  console.log(`Installing dependencies in ${subgraphFolder}...`);
  const installResult = spawnSync('npm', ['install', '--legacy-peer-deps'], {
    stdio: 'inherit',
    cwd: subgraphFolder
  });
  if (installResult.status !== 0) {
    console.error(`❌ Failed npm install for "${subgraphName}"`);
    process.exit(installResult.status);
  }

  // (b) graph codegen
  console.log(`\nGenerating types for ${subgraphName}...`);
  const codegenResult = spawnSync('graph', ['codegen', '--output-dir', 'src/types/'], {
    stdio: 'inherit',
    cwd: subgraphFolder
  });
  if (codegenResult.status !== 0) {
    console.error(`❌ Failed codegen for "${subgraphName}"`);
    process.exit(codegenResult.status);
  }

  // (c) graph create
  console.log(`\nCreating subgraph on node: ${nodeUrl}`);
  const createResult = spawnSync('graph', ['create', subgraphName, '--node', nodeUrl], {
    stdio: 'inherit',
    cwd: subgraphFolder
  });
  if (createResult.status !== 0) {
    console.error(`❌ Failed to create subgraph "${subgraphName}"`);
    process.exit(createResult.status);
  }

  // (d) graph deploy
  console.log(`\nDeploying "${subgraphName}" to ${nodeUrl}...`);
  const deployResult = spawnSync('graph', [
    'deploy',
    subgraphName,
    'subgraph.yaml',
    '--ipfs', ipfsUrl,
    '--node', nodeUrl,
    '--version-label', '0.0.1'
  ], {
    stdio: 'inherit',
    cwd: subgraphFolder
  });
  if (deployResult.status !== 0) {
    console.error(`❌ Failed to deploy subgraph "${subgraphName}"`);
    process.exit(deployResult.status);
  }

  console.log(`✅ Successfully deployed: ${subgraphName}`);
  subgraphOffset += 100;
}

// All done
console.log('\n✅ Environment generated + all subgraphs deployed!');
