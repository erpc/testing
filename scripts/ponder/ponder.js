#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';

<<<<<<< HEAD
import { runComboSetup, runMonitoringSetup } from './functions/setup.js';
=======
import { runUnifiedSetup } from './functions/setup.js';
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
import { writePrometheus, writeGrafanaPanels } from './functions/utils.js';

dotenv.config({ path: path.resolve('../../.env') });

export const GLOBAL_PREFIX = 'erpc-testing-ponder';
const prometheusFile = './monitoring/prometheus/prometheus.yml';
const grafanaTemplate = './monitoring/grafana/dashboards/grafana.template.json';
const grafanaFile     = './monitoring/grafana/dashboards/grafana.json';

async function main() {
  const combos = loadCombos();
  const prometheusScrape = [];

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

    await runComboSetup(
      projectName,
      path.resolve('../../blueprints', blueprint),
      path.resolve('../../variants', variant),
      envVars
    );

    // Collect info for Prometheus
    prometheusScrape.push({
      erpcJob:  `erpc-${projectName}`,
      erpcPort: envVars.ERPC_METRICS_PORT,
      ponderJob: `ponder-${projectName}`,
      ponderPort: envVars.PONDER_PORT,
    });
  }

  // Write out monitoring configs
  writePrometheus(prometheusScrape, prometheusFile);
  writeGrafanaPanels(grafanaTemplate, grafanaFile);
<<<<<<< HEAD

  // Start monitoring stack
  await runMonitoringSetup();
=======
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)

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
<<<<<<< HEAD
    PONDER_PORT: 7100 + index,
    POSTGRES_PORT: 7200 + index,
    ERPC_HTTP_PORT: 7300 + index,
    ERPC_METRICS_PORT: 7400 + index,
    ERPC_PPROF_PORT: 7500 + index,
=======
    PONDER_PORT: 7200 + index,
    POSTGRES_PORT: 7100 + index,
    ERPC_HTTP_PORT: 7200 + index,
    ERPC_METRICS_PORT: 7300 + index,
    ERPC_PPROF_PORT: 7400 + index,
>>>>>>> 07b204f (refactor: reorganize monitoring utilities and streamline setup process)
    ...environment,
    ...process.env,
  };
}


main().catch((err) => {
  console.error(`❌ Top-level error: ${err.message || err}`);
  process.exit(1);
});
