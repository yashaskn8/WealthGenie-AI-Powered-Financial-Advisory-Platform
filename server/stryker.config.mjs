// @ts-check
/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'command',
  commandRunner: {
    command: 'node --test test/portfolioEngine.test.js test/recommendationPipeline.test.js test/monteCarloEngine.test.js test/taxEngine.test.js',
  },
  mutate: [
    'services/portfolioEngine.js',
    'services/RecommendationPipeline.js',
    'services/monteCarloEngine.js',
    'services/taxEngine.js',
  ],
  concurrency: 4,
  timeoutMS: 10000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};

export default config;
