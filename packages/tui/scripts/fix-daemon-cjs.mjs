#!/usr/bin/env node
// Fix daemon CommonJS files to use .cjs extensions in a package with "type": "module"

import { readdir, rename, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const daemonRootDir = join(__dirname, '..', 'dist', 'daemon');
const daemonDir = join(daemonRootDir, 'daemon');
const coreDir = join(daemonRootDir, 'core');

async function renameJsToCjsInDir(dir, label) {
  const files = await readdir(dir);

  // First pass: rename all .js files to .cjs (except .js.map files)
  for (const file of files) {
    if (file.endsWith('.js') && !file.endsWith('.js.map')) {
      const oldPath = join(dir, file);
      const newPath = join(dir, file.replace(/\.js$/, '.cjs'));
      await rename(oldPath, newPath);
      console.log(`${label}: ${file} -> ${file.replace(/\.js$/, '.cjs')}`);
    }
  }
}

async function renameJsToCjs() {
  console.log('Converting daemon files:');
  await renameJsToCjsInDir(daemonDir, '  daemon');
  console.log('\nConverting core files:');
  await renameJsToCjsInDir(coreDir, '  core');
}

async function fixRequireStatementsInDir(dir, label) {
  const files = await readdir(dir);

  // Second pass: update require() statements to use .cjs
  for (const file of files) {
    if (file.endsWith('.cjs')) {
      const filePath = join(dir, file);
      let content = await readFile(filePath, 'utf-8');

      // Fix require statements: require("./foo") -> require("./foo.cjs")
      // This regex matches require("./something") or require('./something')
      content = content.replace(/require\(["'](\.[^"']+)["']\)/g, (match, p1) => {
        // Don't add .cjs if it already has an extension or already ends with .cjs
        if (p1.endsWith('.cjs') || p1.includes('.json')) {
          return match;
        }
        return `require("${p1}.cjs")`;
      });

      await writeFile(filePath, content, 'utf-8');
      console.log(`${label}: ${file}`);
    }
  }
}

async function fixRequireStatements() {
  console.log('Fixing require statements in daemon:');
  await fixRequireStatementsInDir(daemonDir, '  daemon');
  console.log('\nFixing require statements in core:');
  await fixRequireStatementsInDir(coreDir, '  core');
}

async function fixWorkerReference() {
  // Also fix the worker reference in supervisor.cjs
  const supervisorPath = join(daemonDir, 'supervisor.cjs');
  let content = await readFile(supervisorPath, 'utf-8');

  // Fix the hardcoded worker.js reference - match the exact pattern from compiled code
  content = content.replace(/path\.join\(__dirname,\s*['"]worker\.js['"]\)/g,
    'path.join(__dirname, \'worker.cjs\')');

  await writeFile(supervisorPath, content, 'utf-8');
  console.log('Fixed worker.js reference in supervisor.cjs');
}

async function main() {
  try {
    console.log('Converting daemon files to CommonJS (.cjs)...\n');
    await renameJsToCjs();
    console.log('');
    await fixRequireStatements();
    console.log('');
    await fixWorkerReference();
    console.log('\n✅ Daemon CommonJS conversion complete!');
  } catch (err) {
    console.error('Error during conversion:', err);
    process.exit(1);
  }
}

main();
