import fs from "fs";
import yaml from "js-yaml";

// Load the ponder.yaml file
const combos = yaml.load(fs.readFileSync("ponder.yaml", "utf8"));

// Prepare a dictionary of services for docker-compose.yaml
const services = {};

// Use sets to track processed variants and blueprint-variant combinations
const processedVariants = new Set();
const processedBlueprints = new Set();

for (const item of combos) {
  // Parse the variant string to compute the erpc service name.
  const variantStr = item.variant;
  let erpcServiceName;
  if (variantStr) {
    const [version, configType] = variantStr.split("/");
    if (!version || !configType) {
      throw new Error(`❌ Invalid variant format: ${variantStr}`);
    }
    erpcServiceName = `erpc-${version}-${configType}`;
  }
  
  // Process the blueprint service.
  const blueprintStr = item.blueprint;
  const [blueprintType, blueprintFolder] = blueprintStr.split("/");
  if (!blueprintType || !blueprintFolder) {
    throw new Error(`❌ Invalid blueprint format: ${blueprintStr}`);
  }
  
  // Create a unique key for the blueprint service by including the variant.
  const blueprintKey = `${blueprintType}/${blueprintFolder}-${variantStr || 'default'}`;
  const blueprintServiceName = `blueprint-${blueprintType}-${blueprintFolder}-with-erpc-${variantStr ? variantStr.replace('/', '-') : 'default'}`;
  
  // Only add the blueprint service if it hasn't been added before.
  if (!processedBlueprints.has(blueprintKey)) {
    processedBlueprints.add(blueprintKey);
    // Build path assumed as: "../blueprints/<blueprintType>/<blueprintFolder>"
    const buildPath = `../blueprints/${blueprintType}/${blueprintFolder}`;
    
    // Create the blueprint service definition.
    services[blueprintServiceName] = {
      build: buildPath,
      container_name: blueprintServiceName,
      restart: "unless-stopped",
      ...(erpcServiceName ? { depends_on: [erpcServiceName] } : {}),
      environment: {
        DATABASE_SCHEMA: "ponder.schema.ts"
      }
    };
    
    // Read the .env file in the blueprint folder.
    const envFilePath = `${buildPath}/.env`;
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, "utf8");
      const envLines = envContent.split(/\r?\n/);
      const pattern = /^PONDER_RPC_URL_(\d+)$/;
      for (const line of envLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const parts = trimmed.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const match = key.match(pattern);
          if (match && erpcServiceName) {
            const portId = match[1];
            const newUrl = `http://${erpcServiceName}:4000/main/evm/${portId}`;
            services[blueprintServiceName].environment[key] = newUrl;
          }
        }
      }
    }

    console.log(`🔵 Added blueprint service '${blueprintServiceName}' with variant '${variantStr}'`);
  }
  
  // Create an erpc service for the variant if not already processed.
  if (variantStr && !processedVariants.has(variantStr)) {
    processedVariants.add(variantStr);
    const [version, configType] = variantStr.split("/");
    const volumePath = `../variants/${version}/${configType}`;
    const erpcConfigPath = `${volumePath}/erpc.yaml`;
    
    // Define the base erpc service configuration.
    const erpcService = {
      image: `ghcr.io/erpc/erpc:${version}`,
      container_name: erpcServiceName,
      expose: [
        "4000:4000",
        "4001:4001"
      ],
      restart: "always"
    };
    
    // Only set the volumes property if erpc.yaml exists.
    if (fs.existsSync(erpcConfigPath)) {
      erpcService.volumes = [
        `${volumePath}/erpc.yaml:/root/erpc.yaml`
      ];
    }
    
    services[erpcServiceName] = erpcService;
    console.log(`🚀 Added erpc service '${erpcServiceName}' with variant '${variantStr}'`);
  }
}

// Generate docker-compose.yaml content
const dockerCompose = { services };

fs.writeFileSync("docker-compose.yaml", yaml.dump(dockerCompose), "utf8");
console.log("🎉 Successfully generated docker-compose.yaml");
