import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLENDFILE_SUMMARY_TOOLS,
  buildApiDocsArgv,
  buildFastFeedbackCode,
  buildSaveBlendCode,
  buildToolCode,
  clampResolutionScale,
  resolveNavigationTool,
  resolveRenderPath,
  resolveRenderTool,
  resolveSummaryTool,
} from '../src/tool-map.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = path.join(__dirname, '..');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

// ---------------------------------------------------------------------------
// Tool mapping dispatch.

t('blendfile summary types map to body tool names', () => {
  const expected = {
    datablocks: 'get_blendfile_summary_datablocks',
    missing_files: 'get_blendfile_summary_missing_files',
    linked_libraries: 'get_blendfile_summary_of_linked_libraries',
    path_info: 'get_blendfile_summary_path_info',
    usage_guess: 'get_blendfile_summary_usage_guess',
  };
  assert.deepEqual(BLENDFILE_SUMMARY_TOOLS, expected);
  for (const [type, tool] of Object.entries(expected)) {
    assert.equal(resolveSummaryTool(type), tool, type);
  }
});

t('unknown blendfile summary type stays undefined (no silent fallback)', () => {
  assert.equal(resolveSummaryTool('star_wars'), undefined);
  assert.equal(resolveSummaryTool(undefined), undefined);
});

t('navigation actions map to body tool names', () => {
  assert.equal(resolveNavigationTool('jump_to_tab'), 'jump_to_tab_by_name');
  assert.equal(resolveNavigationTool('focus_object'), 'jump_to_view3d_object_by_name');
  assert.equal(resolveNavigationTool('focus_data'), 'jump_to_view3d_object_data_by_name');
  // Pre-existing behaviour: unknown actions fall back to the data-jump tool.
  assert.equal(resolveNavigationTool('bogus'), 'jump_to_view3d_object_data_by_name');
});

t('render types map to body tool names and keep the default path', () => {
  assert.equal(resolveRenderTool('viewport'), 'render_viewport_to_path');
  assert.equal(resolveRenderTool('thumbnail'), 'render_thumbnail_to_path');
  assert.equal(resolveRenderPath('out.png'), 'out.png');
  assert.equal(resolveRenderPath(''), 'render.png');
  assert.equal(resolveRenderPath(undefined), 'render.png');
});

t('fast feedback scale defaults to 30 and clamps to 1-100', () => {
  assert.equal(clampResolutionScale(undefined), 30);
  assert.equal(clampResolutionScale(0), 30);
  assert.equal(clampResolutionScale('not-a-number'), 30);
  assert.equal(clampResolutionScale('55'), 55);
  assert.equal(clampResolutionScale(1000), 100);
  assert.equal(clampResolutionScale(-4), 1);
});

// ---------------------------------------------------------------------------
// Source generation.

const PARAMS_LITERAL = /json\.loads\(("(?:[^"\\]|\\.)*")\)/;

function paramsLiteral(source) {
  const match = source.match(PARAMS_LITERAL);
  assert.ok(match, 'generated source embeds json.loads(<literal>)');
  return match[1];
}

t('tool code keeps the parameter-unpacking wrapper', () => {
  const source = buildToolCode('def main(p):\n    return p\n', { name: 'Cube' });
  assert.ok(source.startsWith('def main(p):'));
  for (const fragment of ['params_dict = json.loads(', 'Params(**params_dict)', '_rv = main(p)',
    'check_is_finished = _rv', 'result = _rv._asdict()', 'result = {"status": "error"']) {
    assert.ok(source.includes(fragment), fragment);
  }
});

t('tool code embeds params as an inert Python string literal', () => {
  const params = { name: 'a"); import os; ("', nested: { q: 'line\nbreak' }, n: 3 };
  const source = buildToolCode('x = 1\n', params);
  // The literal is a valid JSON string that decodes to the serialized params.
  const decoded = JSON.parse(JSON.parse(paramsLiteral(source)));
  assert.deepEqual(decoded, params);
  // A payload cannot add source lines, so it stays inert inside the literal.
  assert.equal(
    source.split('\n').length,
    buildToolCode('x = 1\n', {}).split('\n').length,
  );
});

t('save_blend source escapes paths and preserves the copy flag', () => {
  const plain = buildSaveBlendCode('/tmp/model.blend', false);
  assert.equal(plain, 'import bpy; bpy.ops.wm.save_as_mainfile(filepath="/tmp/model.blend")\nresult={"status":"saved"}');
  assert.ok(buildSaveBlendCode('/tmp/model.blend', true).includes(', copy=True)'));

  const hostile = '/tmp/a"b\\c\nimport os; os.system("x")\n';
  const code = buildSaveBlendCode(hostile, false);
  const literal = code.match(/filepath=("(?:[^"\\]|\\.)*")\)/)[1];
  assert.equal(JSON.parse(literal), hostile);
  assert.equal(code.split('\n').length, 2);
});

t('fast feedback source escapes the path and clamps the scale', () => {
  const code = buildFastFeedbackCode('a"b.png', 500);
  const literal = code.match(/get_fast_feedback\(("(?:[^"\\]|\\.)*"), resolution_scale=(\d+)\)/);
  assert.ok(literal, code);
  assert.equal(JSON.parse(literal[1]), 'a"b.png');
  assert.equal(Number(literal[2]), 100);
  assert.equal(buildFastFeedbackCode(undefined, undefined), 'result = helpers.get_fast_feedback("critic_feedback.png", resolution_scale=30)');
});

// ---------------------------------------------------------------------------
// Subprocess argument safety.

t('api docs argv keeps the identifier as one inert argument', () => {
  const hostile = 'bpy.types.Scene; rm -rf / --no-preserve-root';
  const argv = buildApiDocsArgv('/body/venv/bin/python3', '/brain/dist/api_docs_bridge.py', hostile);
  assert.equal(argv.length, 3);
  assert.equal(argv[0], '/body/venv/bin/python3');
  assert.equal(argv[1], '/brain/dist/api_docs_bridge.py');
  assert.deepEqual(argv.slice(2), [hostile]);
  for (const value of ['$(id)', '`id`', 'a b\tc', '"quoted"']) {
    assert.deepEqual(buildApiDocsArgv('py', 'bridge.py', value).slice(2), [value]);
  }
});

t('index.ts invokes the docs bridge without a shell', () => {
  const source = fs.readFileSync(path.join(BRAIN_DIR, 'src/index.ts'), 'utf8');
  assert.match(source, /execFileSync\(argv\[0\], argv\.slice\(1\)/);
  assert.match(source, /buildApiDocsArgv\(PYTHON_INTERPRETER, API_BRIDGE_PATH, args\?\.identifier\)/);
  assert.doesNotMatch(source, /execSync\(/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

// ---------------------------------------------------------------------------
// Clean-build asset copying.

const pkg = JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, 'package.json'), 'utf8'));

t('build script copies prompts and the python bridge into dist', () => {
  const build = pkg.scripts.build;
  assert.ok(build.includes('cp -r src/agents dist/'), build);
  assert.ok(build.includes('cp src/*.py dist/'), build);
  assert.ok(!build.includes('|| true'), 'copy failures must not be hidden');
  assert.ok(!/2>\/dev\/null/.test(build), 'copy failures must not be hidden');
});

t('all prompt assets and the docs bridge exist in src', () => {
  for (const agent of ['planner', 'writer', 'debugger', 'critic']) {
    assert.ok(fs.existsSync(path.join(BRAIN_DIR, 'src/agents/prompts', `${agent}.md`)), agent);
  }
  assert.ok(fs.existsSync(path.join(BRAIN_DIR, 'src/api_docs_bridge.py')));
});

t('a clean build output carries the copied assets', () => {
  const dist = path.join(BRAIN_DIR, 'dist');
  if (!fs.existsSync(dist)) {
    console.log('# dist/ absent, skipping copy verification (npm run build creates it)');
    return;
  }
  assert.ok(fs.existsSync(path.join(dist, 'api_docs_bridge.py')));
  for (const agent of ['planner', 'writer', 'debugger', 'critic']) {
    assert.ok(fs.existsSync(path.join(dist, 'agents/prompts', `${agent}.md`)), agent);
  }
});

t('package version is the version advertised by the MCP server', () => {
  const source = fs.readFileSync(path.join(BRAIN_DIR, 'src/index.ts'), 'utf8');
  assert.ok(source.includes(`version: "${pkg.version}"`), `index.ts should report ${pkg.version}`);
});

console.log(`\n${n} brain-tools tests passed.`);
