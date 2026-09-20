import { defineConfig } from '@hey-api/openapi-ts';
import specification from './openapi.json';
import { normalizeSpec } from './scripts/normalize-spec';

export const operationPaths: Record<string, string[]> = {
  healthCheck: ['health', 'check'],
  healthCheckAuth: ['health', 'verifyAccessKey'],
  getUsage: ['usage', 'get'],
  createBrand: ['brands', 'create'],
  listBrands: ['brands', 'list'],
  getBrand: ['brands', 'get'],
  updateBrand: ['brands', 'update'],
  deleteBrand: ['brands', 'delete'],
  getBrandPrompts: ['brands', 'prompts', 'get'],
  setBrandPrompts: ['brands', 'prompts', 'set'],
  getBrandCompetitors: ['brands', 'competitors', 'get'],
  setBrandCompetitors: ['brands', 'competitors', 'set'],
  getBrandKeywords: ['brands', 'keywords', 'get'],
  setBrandKeywords: ['brands', 'keywords', 'set'],
  getBrandTimeline: ['brands', 'timeline'],
  getBrandOverview: ['brands', 'overview'],
  getRank: ['rank', 'get'],
  getKeywords: ['keywords', 'get'],
  getKeywordIdeas: ['keywordIdeas', 'get'],
  getAiKeywordVolume: ['aiKeywordVolume', 'get'],
  getVisibility: ['visibility', 'get'],
  runPrompt: ['prompts', 'run'],
  listModels: ['models', 'list'],
  querySnapshots: ['snapshots', 'query'],
  createTracker: ['trackers', 'create'],
  listTrackers: ['trackers', 'list'],
  getTracker: ['trackers', 'get'],
  updateTracker: ['trackers', 'update'],
  deleteTracker: ['trackers', 'delete'],
  runTracker: ['trackers', 'run'],
  createScan: ['scans', 'create'],
  listScans: ['scans', 'list'],
  getScan: ['scans', 'get'],
  getAlerts: ['alerts', 'get'],
  getRecommendations: ['recommendations', 'get'],
  listNotifications: ['notifications', 'list'],
  createNotification: ['notifications', 'create'],
  getNotification: ['notifications', 'get'],
  updateNotification: ['notifications', 'update'],
  deleteNotification: ['notifications', 'delete'],
  rotateNotificationSecret: ['notifications', 'rotateSecret'],
  testNotification: ['notifications', 'test'],
  getBacklinks: ['backlinks', 'get'],
  getDomainOverview: ['domainOverview', 'get'],
  getRankedKeywords: ['rankedKeywords', 'get'],
  getAudit: ['audit', 'get'],
  getMentions: ['mentions', 'get'],
  getMentionsHistory: ['mentions', 'history'],
  getCitations: ['citations', 'get'],
  getCompetitors: ['competitors', 'get'],
};

export default defineConfig({
  input: normalizeSpec(specification),
  output: { path: './src/generated' },
  plugins: [
    { name: '@hey-api/client-fetch', throwOnError: true },
    {
      name: '@hey-api/sdk',
      auth: true,
      paramsStructure: 'grouped',
      operations: {
        containerName: 'Trackee',
        strategy: 'single',
        nesting(operation) {
          const path = operationPaths[operation.operationId ?? ''];
          if (!path) throw new Error(`Unmapped operation: ${operation.operationId}`);
          return path;
        },
      },
    },
  ],
});
