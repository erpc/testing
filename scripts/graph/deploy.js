import { spawnSync } from "child_process";

const subgraphs = [
  {
    "name": "uniswap-v2-latest_no_config_defaults",
    "node": "http://localhost:8020",
    "ipfs": "http://localhost:5001",
    "folder": "../../blueprints/graph/uniswap-v2"
  },
  {
    "name": "uniswap-v3-latest_no_config_defaults",
    "node": "http://localhost:8120",
    "ipfs": "http://localhost:5001",
    "folder": "../../blueprints/graph/uniswap-v3"
  },
  {
    "name": "uniswap-v4-latest_no_config_defaults",
    "node": "http://localhost:8220",
    "ipfs": "http://localhost:5001",
    "folder": "../../blueprints/graph/uniswap-v4"
  }
];

for (const s of subgraphs) {
  console.log("\n=== Installing dependencies for: " + s.name + " ===");

  // Run npm install first
  const installResult = spawnSync("npm", ["install", "--legacy-peer-deps"], {
    stdio: "inherit",
    cwd: s.folder
  });

  if (installResult.status !== 0) {
    console.error(`❌ Failed to install dependencies for "${s.name}"`);
    process.exit(installResult.status);
  }

  // Run codegen to generate the types folder
  console.log("\n=== Generating types for: " + s.name + " ===");

  const codegenResult = spawnSync("graph", [
    "codegen",
    "--output-dir", "src/types/"
  ], {
    stdio: "inherit",
    cwd: s.folder
  });
  if (codegenResult.status !== 0) {
    console.error(`❌ Failed to run codegen for "${s.name}"`);
    process.exit(codegenResult.status);
  }

  console.log("\n=== Deploying subgraph: " + s.name + " ===");

  // 1) graph create <subgraph> --node <url>
  const createResult = spawnSync("graph", [
    "create",
    s.name,
    "--node", s.node
  ], {
    stdio: "inherit",
    cwd: s.folder
  });

  if (createResult.status !== 0) {
    console.error(`❌ Failed to create subgraph "${s.name}"`);
    process.exit(createResult.status);
  }

  // 2) graph deploy <subgraph> subgraph.yaml --ipfs <ipfs> --node <node>
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
    console.error(`❌ Failed to deploy subgraph "${s.name}"`);
    process.exit(deployResult.status);
  }

  console.log(`✅ Successfully deployed subgraph: ${s.name}`);
}
