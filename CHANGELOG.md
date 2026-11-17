## [3.0.4] - 2026-11-18

### Fixed
- Brain ServerInfo version now comes from one `MCP_SERVER_VERSION` constant instead of a hardcoded literal, so a `package.json` bump can no longer leave the server reporting an old number.

### Tests
- Added `brain/test/version.test.mjs` (run first by `npm test`) asserting the constant equals `brain/package.json.version`; the existing brain-tools version check now verifies `index.ts` advertises the constant.

## [3.0.3] - 2026-11-18

### Added
- `npm run test:blender` (brain) validates the bridge against a live Blender: scene summary, Python execution inside Blender, object visibility, object details, and the render call. Verified headless with Blender 5.3 and the add-on on `localhost:9876`.

### Known limitation
- `render_output` reports success with a filepath under Blender's temp directory but writes no file when Blender runs headless (`--background`). Rendering still needs a GUI instance; the check records the path instead of asserting a file.

# Changelog

All notable changes to this project.

## [3.0.2] - 2026-11-18

### Fixed
- Blender socket bridge now expires incomplete clients on monotonic deadlines instead of timer ticks, so idle polling cannot stretch the timeout.
- Concurrent incomplete Blender socket clients are capped (`MAX_INCOMPLETE_CLIENTS`, default 64); excess connections receive an error and are closed.
- Blender socket responses are buffered and drained when the non-blocking socket is writable, preventing truncated responses under backpressure.

### Added
- Brain unit tests for tool mapping dispatch, Blender source generation, subprocess argument safety, and clean-build asset copying.

## [3.0.1] - 2026-11-13

### Changed
- Updated dependency advisories, declared GPL-3.0-or-later, and synchronized canonical documentation.

## [3.0.0] - 2026-10-31

### Changed
- **Version reset to 3.0.0** — per-server version metadata baseline reset (Phase 7). All `package.json`, MCP `ServerInfo.version`, and HTTP metadata now report `3.0.0`. This is a metadata/interface baseline reset; for `hela-plastid` it is not an upgrade from the previous `4.2.0` advert.

