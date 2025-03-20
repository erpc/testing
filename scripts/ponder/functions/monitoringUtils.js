import fs from 'fs';

export function writePrometheus(prometheusScrape, prometheusFile) {
  let content = `global:
  scrape_interval: 15s

scrape_configs:
`;
  for (const c of prometheusScrape) {
    content += `
  - job_name: ${c.erpcJob}
    static_configs:
      - targets: ['host.docker.internal:${c.erpcPort}']

  - job_name: ${c.ponderJob}
    static_configs:
      - targets: ['host.docker.internal:${c.ponderPort}']
`;
  }
  fs.writeFileSync(prometheusFile, content.trim() + '\n', 'utf8');
  console.log(`\n✅ Wrote fresh ${prometheusFile}`);
}

export function writeGrafanaPanels(newPanels, grafanaTemplate, grafanaFile) {
  const baseDashboard = JSON.parse(fs.readFileSync(grafanaTemplate, 'utf8'));
  console.log('ℹ️  Creating new minimal dashboard skeleton');
  
  for (const p of newPanels) {
    const alreadyExists = baseDashboard.panels.find((panel) => panel.title === p.title);
    if (alreadyExists) {
      console.log(`⚠️  Skipping panel "${p.title}" (already exists)`);
      continue;
    }
    baseDashboard.panels.push(p);
  }
  
  fs.writeFileSync(grafanaFile, JSON.stringify(baseDashboard, null, 2), 'utf8');
  console.log(`✅ Updated ${grafanaFile} with Postgres panels (no duplicates)`);
}
