import fs from 'fs';

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
    metrics_path: "/metrics"
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
