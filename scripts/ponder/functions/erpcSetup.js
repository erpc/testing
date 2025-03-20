import path from 'path';
import { runDockerCompose } from './cmd.js';


export async function runErpcSetup(projectName, variantPath, envVars) {
  console.log('variantPath', variantPath);
  await runDockerCompose(
    projectName,
    path.resolve('../../variants', variantPath),
    envVars
  );
}
