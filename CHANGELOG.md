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

