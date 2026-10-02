import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { vertexHealthPlugin } from './server/vertex-health.ts';
import { briefAnalysisPlugin } from './server/brief-analysis.ts';
import { briefStoragePlugin } from './server/brief-storage.ts';
import { driveProjectPlugin } from './server/drive-project.ts';
import { jiraIntegrationPlugin } from './server/jira-integration.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const extractionModel = env.GEMINI_EXTRACTION_MODEL || 'gemini-3.5-flash-lite';
  const routingModel = extractionModel;

  return {
    plugins: [
      react(),
      tailwindcss(),
      jiraIntegrationPlugin({
        cloudId: env.JIRA_CLOUD_ID || '',
        projectKey: env.JIRA_PROJECT_KEY || '',
        issueTypeId: env.JIRA_ISSUE_TYPE_ID || '33921',
        token: env.JIRA_API_TOKEN || '',
        siteUrl: env.JIRA_BASE_URL || 'https://mediamonks.atlassian.net',
        intakeToolBaseUrl: env.INTAKE_TOOL_BASE_URL || 'http://localhost:5173',
      }),
      briefStoragePlugin(),
      driveProjectPlugin(
        {
          parentFolderId: env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '1DoVzqRpAhJWuE1v3h3kNu26JJPdbCNrA',
          credentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS,
        },
        process.cwd(),
      ),
      briefAnalysisPlugin({
        project: env.GOOGLE_CLOUD_PROJECT || 'scj-nacb-transfor-ai',
        location: env.GOOGLE_CLOUD_LOCATION || 'global',
        routingModel,
        extractionModel,
      }),
      vertexHealthPlugin({
        project: env.GOOGLE_CLOUD_PROJECT || 'scj-nacb-transfor-ai',
        location: env.GOOGLE_CLOUD_LOCATION || 'global',
        models: [routingModel, extractionModel],
      }),
    ],
  };
});
