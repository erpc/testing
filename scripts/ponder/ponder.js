#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';

import { runErpcSetup } from './functions/erpcSetup.js';
import { runPonderSetup } from './functions/ponderSetup.js';
import { writePrometheus, writeGrafanaPanels } from './functions/monitoringUtils.js';

dotenv.config({ path: path.resolve('../../.env') });

const GLOBAL_PREFIX = 'erpc-testing-ponder';
const prometheusFile = './monitoring/prometheus/prometheus.yml';
const grafanaTemplate = './monitoring/grafana/dashboards/grafana.template.json';
const grafanaFile     = './monitoring/grafana/dashboards/grafana.json';

async function main() {
  const combos = loadCombos();

  const prometheusScrape = [];
  const postgresDatasets = [];
  const newPanels = [];

  for (let index = 0; index < combos.length; index++) {
    const combo = combos[index];
    const { blueprint, variant, environment } = combo;
    if (!blueprint || !variant) {
      console.warn('Skipping combo missing blueprint or variant:', combo);
      continue;
    }

    const projectName = `${GLOBAL_PREFIX}-combo-${index}`;
    const envVars = buildEnvVars(projectName, index, environment);

    console.log(`\n=== Starting ${projectName} ===`);
    await runErpcSetup(projectName, variant, envVars);
    await runPonderSetup(projectName, blueprint, envVars);

    // Collect info for Prometheus
    prometheusScrape.push({
      erpcJob:  `erpc-${projectName}`,
      erpcPort: envVars.ERPC_METRICS_PORT,
      ponderJob: `ponder-${projectName}`,
      ponderPort: envVars.PONDER_PORT,
    });

    // Collect info for Postgres
    const dsName = `Postgres-${projectName}`;
    const dsPort = envVars.POSTGRES_PORT;
    postgresDatasets.push({ dsName, dsPort });
  }

  // Write out monitoring configs
  writePrometheus(prometheusScrape, prometheusFile);
  writeGrafanaPanels(newPanels, grafanaTemplate, grafanaFile);

  console.log('\n=== Monitoring stack started! ===');
}

// ------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------
function loadCombos() {
  try {
    const raw = fs.readFileSync('ponder.yaml', 'utf8');
    const combos = yaml.load(raw);
    if (!Array.isArray(combos)) {
      throw new Error('ponder.yaml is not an array of blueprint–variant combos!');
    }
    return combos;
  } catch (err) {
    console.error('❌ Could not parse ponder.yaml:', err.message);
    process.exit(1);
  }
}

function buildEnvVars(projectName, index, environment) {
  return {
    NETWORK_NAME: `${projectName}_net`,
    POSTGRES_PORT: 7000 + index,
    IPFS_PORT: 7100 + index,
    PONDER_PORT: 7200 + index,
    ERPC_HTTP_PORT: 7800 + index,
    ERPC_METRICS_PORT: 7900 + index,
    ERPC_PPROF_PORT: 8000 + index,
    ...environment,
    ...process.env,
  };
}


main().catch((err) => {
  console.error(`❌ Top-level error: ${err.message || err}`);
  process.exit(1);
});
