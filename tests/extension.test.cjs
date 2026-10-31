const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('MV3 and local-only minimum permissions', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const file of [manifest.action.default_popup, manifest.background.service_worker,
    ...manifest.content_scripts.flatMap(x => x.js)]) assert.ok(fs.existsSync(file));
});

test('CSV preserves Turkish text and escapes formulas and quotes', () => {
  const source = fs.readFileSync('popup.js', 'utf8');
  const fn = source.slice(source.indexOf('function csvCell('), source.indexOf("$('download').addEventListener"));
  const sandbox = {}; vm.createContext(sandbox); vm.runInContext(fn, sandbox);
  assert.equal(sandbox.csvCell('İstanbul; "Kafe"'), '"İstanbul; ""Kafe"""');
  assert.equal(sandbox.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(sandbox.csvCell('  @SUM(1)'), '"\'  @SUM(1)"');
  assert.equal(sandbox.csvCell(null), '""');
});
