import path from 'path';
import { runDockerCompose } from './cmd.js';


export async function runPonderSetup(projectName, blueprintPath, envVars) {
  await runDockerCompose(
    projectName,
    path.resolve('../../blueprints', blueprintPath),
    envVars
  );
}
