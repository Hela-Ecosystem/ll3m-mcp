#!/usr/bin/env node
/**
 * Validate the Blender bridge end to end against a running Blender.
 *
 * Requires the addon enabled with its socket server listening on
 * localhost:9876 (`blender --background --online-mode --command blender_mcp`).
 * Runs in the brain package so it can import the built server.
 *
 * Usage: node scripts/verify-blender.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let failures = 0;
const report = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  stderr: 'ignore',
});
const client = new Client({ name: 'blender-hw-check', version: '1.0.0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('') ?? '';
  return { isError: Boolean(res.isError), text };
};

try {
  const scene = await call('get_scene_summary');
  report('scene summary over the socket bridge', !scene.isError, scene.text.slice(0, 90).replace(/\n/g, ' '));

  const created = await call('execute_blender_code', {
    code: [
      'import bpy',
      'bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))',
      'cube = bpy.context.active_object',
      'cube.name = "HelaIoCheck"',
      'print("created", cube.name, len(bpy.data.objects))',
    ].join('\n'),
  });
  report('execute python inside Blender', !created.isError && /created HelaIoCheck/.test(created.text), created.text.slice(0, 90).replace(/\n/g, ' '));

  const summary = await call('get_scene_summary');
  report('object visible in the scene', !summary.isError && /HelaIoCheck/.test(summary.text), summary.text.slice(0, 90).replace(/\n/g, ' '));

  const details = await call('get_object_details', { object_name: 'HelaIoCheck' });
  const detailsOk = !details.isError && /HelaIoCheck/.test(details.text) && /"status":\s*"ok"/.test(details.text);
  report('object details', detailsOk, details.text.slice(0, 90).replace(/\n/g, ' '));

  const render = await call('render_output', { type: 'thumbnail', output_path: '/tmp/hela-render-check.png' });
  const renderedPath = (render.text.match(/"filepath":\s*"([^"]+)"/) ?? [])[1] ?? '';
  const fs = await import('node:fs');
  const exists = renderedPath ? fs.existsSync(renderedPath) : false;
  const renderResult = (() => {
    try { return JSON.parse(render.text); } catch { return null; }
  })();
  if (exists) {
    const nonEmpty = fs.statSync(renderedPath).size > 0;
    report('render output writes a non-empty file', !render.isError && renderResult?.status === 'ok' && nonEmpty, `${renderedPath} (non-empty: ${nonEmpty})`);
  } else {
    report('headless render reports GUI requirement', render.isError && renderResult?.status === 'error' && /GUI Blender session/i.test(renderResult?.message ?? ''), render.text.slice(0, 140).replace(/\n/g, ' '));
  }
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nall blender checks passed' : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
