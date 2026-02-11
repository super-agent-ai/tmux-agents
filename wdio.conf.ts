import * as path from 'path';
import * as os from 'os';

const userDataDir = path.join(os.tmpdir(), 'wdio-vscode');

export const config = {
  runner: 'local',
  autoCompileOpts: {
    tsNodeOpts: {
      project: './e2e/tsconfig.json',
    },
  },
  specs: ['./e2e/**/*.test.ts'],
  maxInstances: 1,
  waitforTimeout: 30000,
  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'stable',
    'wdio:vscodeOptions': {
      extensionPath: process.cwd(),
      userSettings: {
        'window.titleBarStyle': 'custom',
      },
      vscodeArgs: {
        'user-data-dir': userDataDir,
      },
    },
  }],
  services: ['vscode'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
};
