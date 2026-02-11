export const config = {
  runner: 'local',
  specs: ['./e2e/**/*.test.ts'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'stable',
    'wdio:vscodeOptions': {
      extensionPath: process.cwd(),
    },
  }],
  services: ['vscode'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
};
