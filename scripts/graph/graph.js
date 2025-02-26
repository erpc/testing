import { fileURLToPath } from "url";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const scriptRoot = path.dirname(__filename);
const projectRoot = path.join(scriptRoot);

// 1. Load combos.yaml
const combosFile = path.join(scriptRoot, "graph.yaml");
if (!fs.existsSync(combosFile)) {
  throw new Error(`❌ Could not find '${combosFile}'`);
}
const combos = yaml.load(fs.readFileSync(combosFile, "utf8"));

// --------------------------------------------------------------------------
// A. Prepare base Docker services (ipfs, postgres) that are always present
// --------------------------------------------------------------------------
const services = {
  postgres: {
    image: "postgres:14",
    ports: ["5432:5432"],
    command: [
      "postgres",
      "-cshared_preload_libraries=pg_stat_statements",
      "-cmax_connections=200"
    ],
    environment: {
      POSTGRES_USER: "graph-node",
      POSTGRES_PASSWORD: "let-me-in",
      POSTGRES_DB: "graph-node",
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
    },
    volumes: [
      "./data/postgres:/var/lib/postgresql/data"
    ],
    logging: {
      driver: "local",
      options: {
        "max-size": "5M",
        "max-file": "3"
      }
    },
    healthcheck: {
      test: ["CMD-SHELL", "pg_isready -q -d graph-node -U graph-node"],
      interval: "1s",
      timeout: "5s",
      retries: 10
    }
  },
  ipfs: {
    image: "ipfs/kubo:v0.14.0",
    ports: ["5001:5001"],
    volumes: [
      "./data/ipfs:/data/ipfs"
    ],
    logging: {
      driver: "local",
      options: {
        "max-size": "5M",
        "max-file": "3"
      }
    },
    healthcheck: {
      test: ["CMD", "ipfs", "id"],
      interval: "1s",
      timeout: "5s",
      retries: 5
    }
  }
};

// --------------------------------------------------------------------------
// B. Dynamically create eRPC services for each unique variant in combos
// --------------------------------------------------------------------------
const processedVariants = new Set();
for (const combo of combos) {
  const variantStr = combo.variant;
  if (!variantStr) {
    // skip combos with no variant
    continue;
  }
  if (!processedVariants.has(variantStr)) {
    processedVariants.add(variantStr);

    // e.g. "latest/no-config-defaults" => version="latest", configType="no-config-defaults"
    const [version, configType] = variantStr.split("/");
    // Container name => "erpc-latest_no_config_defaults"
    const safeVariant = variantStr.replace(/\//g, "-").replace(/-/g, "_");
    const erpcServiceName = `erpc-${safeVariant}`;

    // We'll look for erpc.yaml in ../variants/<version>/<configType>/erpc.yaml
    const volumePath = path.join("..", "variants", version, configType);
    const erpcConfigPath = path.join(volumePath, "erpc.yaml");

    const erpcService = {
      image: `ghcr.io/erpc/erpc:${version}`,
      container_name: erpcServiceName,
      expose: ["4000:4000", "4001:4001"],
      restart: "always"
    };

    // Only mount erpc.yaml if it exists
    if (fs.existsSync(erpcConfigPath)) {
      erpcService.volumes = [
        `${volumePath}/erpc.yaml:/root/erpc.yaml`
      ];
    }

    services[erpcServiceName] = erpcService;
    console.log(`🚀 Added eRPC service '${erpcServiceName}' for variant '${variantStr}'`);
  }
}

// --------------------------------------------------------------------------
// C. Filter combos to only create Graph Node services for "graph/" blueprint combos
// --------------------------------------------------------------------------
const uniqueGraphCombos = [];
const seenGraphKey = new Set();
for (const combo of combos) {
  const { variant, blueprint } = combo;
  if (!variant || !blueprint) {
    console.warn(`Skipping combo with missing variant/blueprint: ${JSON.stringify(combo)}`);
    continue;
  }
  // Only handle combos whose blueprint starts with "graph/"
  if (!blueprint.startsWith("graph/")) {
    continue;
  }
  const key = `${variant}::${blueprint}`;
  if (!seenGraphKey.has(key)) {
    seenGraphKey.add(key);
    uniqueGraphCombos.push(combo);
  }
}

// --------------------------------------------------------------------------
// D. Minimal config.toml for each Graph Node combo
// --------------------------------------------------------------------------
function buildConfigToml(erpcContainerName) {
  const content = `\
[store]
[store.primary]
connection = "postgresql://graph-node:let-me-in@postgres:5432/graph-node"
pool_size = 10

[deployment]
[[deployment.rule]]
store = "primary"
indexers = ["default"]

[chains]
ingestor = "default"

[chains.mainnet]
shard = "primary"
provider = [
  { label = "erpc", url = "http://__ERPC_CONTAINER__:4000/main/evm/1", features = ["archive"] }
]
`;
  return content.replace("__ERPC_CONTAINER__", erpcContainerName);
}

// We'll collect subgraph deployments to create the deploy-subgraphs.js
const subgraphDeployments = [];

// --------------------------------------------------------------------------
// E. Create one Graph Node service per unique (variant, blueprint), with port offsets
// --------------------------------------------------------------------------
const basePorts = [8000, 8001, 8020, 8030, 8040];
const offsetIncrement = 100;
let graphIndex = 0;

for (const combo of uniqueGraphCombos) {
  const { variant, blueprint } = combo;
  // blueprint might be "graph/uniswap-v2" => we only use the part after "graph/"
  const [bpType, bpName] = blueprint.split("/");

  // Rebuild the same safe variant name used above
  const safeVariant = variant.replace(/\//g, "-").replace(/-/g, "_");
  const erpcContainerName = `erpc-${safeVariant}`;

  // We'll name the Graph Node config file and container
  const configFileName = `config.${bpName}-${erpcContainerName}.toml`;
  const graphNodeServiceName = `graph-node-${bpName}-with-${erpcContainerName}`;

  // 1. Build & write the config
  const configToml = buildConfigToml(erpcContainerName);
  const configDir = path.join(projectRoot, "config");
  fs.mkdirSync(configDir, { recursive: true });
  const outPath = path.join(configDir, configFileName);
  fs.writeFileSync(outPath, configToml, "utf8");
  console.log(`📝 Wrote Graph Node config: ${path.relative(projectRoot, outPath)}`);

  // 2. Calculate port offset for this container
  const portOffset = graphIndex * offsetIncrement;
  const adjustedPorts = basePorts.map((p) => `${p + portOffset}:${p}`);

  // 3. Add the Graph Node service
  services[graphNodeServiceName] = {
    image: "graphprotocol/graph-node",
    container_name: graphNodeServiceName,
    ports: adjustedPorts,
    depends_on: [
      "ipfs",
      "postgres",
      erpcContainerName
    ],
    extra_hosts: ["host.docker.internal:host-gateway"],
    volumes: [
      "./config:/etc/config"
    ],
    environment: {
      postgres_host: "postgres",
      postgres_user: "graph-node",
      postgres_pass: "let-me-in",
      postgres_db: "graph-node",
      ipfs: "ipfs:5001",
      GRAPH_NODE_CONFIG: `/etc/config/${configFileName}`,
      GRAPH_LOG: "info"
    },
    restart: "no"
  };

  // 4. Determine the indexing API host port (8020 in container)
  const indexingApiContainerPort = 8020; // basePorts[2]
  const containerPortIndex = basePorts.indexOf(indexingApiContainerPort);
  if (containerPortIndex < 0) {
    throw new Error("Could not find 8020 in basePorts!");
  }
  const indexingApiHostPort = indexingApiContainerPort + portOffset;

  // 5. We want to store enough info to run "graph create" and "graph deploy"
  // so we'll track the folder path for subgraph.yaml, which is ../blueprints/<bpName>
  const subgraphFolder = path.join("..", "..", "blueprints", bpType, bpName);

  // We'll push a new subgraph definition for "deploy-subgraphs.js"
  subgraphDeployments.push({
    name: `${bpName}-${safeVariant}`,      // e.g. "uniswap-v2-latest_no_config_defaults"
    node: `http://localhost:${indexingApiHostPort}`,
    ipfs: "http://localhost:5001",
    folder: subgraphFolder
  });

  graphIndex++;
}

// --------------------------------------------------------------------------
// F. Write out docker-compose.graph.yaml
// --------------------------------------------------------------------------
const dockerCompose = { services };
const outComposeFile = path.join(projectRoot, "docker-compose.graph.yaml");
fs.writeFileSync(outComposeFile, yaml.dump(dockerCompose), "utf8");
console.log(`✅ Successfully generated docker-compose file: ${path.relative(projectRoot, outComposeFile)}`);

// --------------------------------------------------------------------------
// G. Generate deploy-subgraphs.js that uses subgraphDeployments
// --------------------------------------------------------------------------
const deployScriptLines = [];
deployScriptLines.push(`import { spawnSync } from "child_process";\n`);

deployScriptLines.push(`const subgraphs = ${JSON.stringify(subgraphDeployments, null, 2)};\n`);

deployScriptLines.push(`for (const s of subgraphs) {
  console.log("\\n=== Installing dependencies for: " + s.name + " ===");
  
  // Run npm install first
  const installResult = spawnSync("npm", ["install", "--legacy-peer-deps"], {
    stdio: "inherit",
    cwd: s.folder
  });

  if (installResult.status !== 0) {
    console.error(\`❌ Failed to install dependencies for "\${s.name}"\`);
    process.exit(installResult.status);
  }

  console.log("\\n=== Deploying subgraph: " + s.name + " ===");

  // 1) graph create <subgraph> --node <url>, run from the subgraph folder
  const createResult = spawnSync("graph", [
    "create",
    s.name,
    "--node", s.node
  ], {
    stdio: "inherit",
    cwd: s.folder
  });

  if (createResult.status !== 0) {
    console.error(\`❌ Failed to create subgraph "\${s.name}"\`);
    process.exit(createResult.status);
  }

  // 2) graph deploy <subgraph> subgraph.yaml --ipfs <ipfs> --node <node>, also from the subgraph folder
  const deployResult = spawnSync("graph", [
    "deploy",
    s.name,
    "subgraph.yaml",
    "--ipfs", s.ipfs,
    "--node", s.node,
    "--version-label", "0.0.1"
  ], {
    stdio: "inherit",
    cwd: s.folder
  });

  if (deployResult.status !== 0) {
    console.error(\`❌ Failed to deploy subgraph "\${s.name}"\`);
    process.exit(deployResult.status);
  }

  console.log(\`✅ Successfully deployed subgraph: \${s.name}\`);
}
`);

const deployScriptPath = path.join(projectRoot, "deploy.js");
fs.writeFileSync(deployScriptPath, deployScriptLines.join("\n"), "utf8");
console.log(`✅ Wrote deploy-subgraphs.js: ${path.relative(projectRoot, deployScriptPath)}`);
