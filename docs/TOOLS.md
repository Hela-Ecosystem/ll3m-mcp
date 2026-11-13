# HeLa Plastid: canonical tools

Server version **3.0.1**. Generated from the ecosystem schema catalog; regenerate with `npm run docs:generate -- --servers` in the ecosystem checkout.

Only names advertised by `tools/list` are listed here. Older aliases in migration examples are not additional tools. Runtime namespace prefixes are optional and do not change these server-local names.

## `execute_blender_code`

[R3 Native Execution] Execute arbitrary Python code in Blender. WARNING: Runs with full Blender process privileges; WeakSandboxForLLM is an in-process operator filter, not an OS sandbox. Gated by HELA_PLASTID_ALLOW_CODE.

## `execute_staged_refinement`

[R3 Native Execution] Execute a technical Geometric Delta (Python code) provided by the Critic. Use this recursively until the Quality Score reaches 90+. WARNING: Runs with full Blender process privileges. Gated by HELA_PLASTID_ALLOW_CODE.

## `generate_modeling_plan`

Generate a multi-component 3D modeling plan with high-fidelity mandates.

## `get_agent_instructions`

Retrieve specialized persona instructions (planner/writer/debugger/critic).

## `get_api_docs`

Advanced Blender Python API RAG: Get precise documentation, examples, and signatures.

## `get_blender_helpers`

Retrieve a list of high-level Python helper functions available in the Blender environment (e.g., setup_pbr, apply_subd).

## `get_blendfile_summary`

Detailed summary of the .blend file (datablocks, missing files, linked libraries).

## `get_fast_feedback`

Capture a low-resolution, high-speed Workbench screenshot for agent self-criticism.

## `get_modeling_patterns`

Retrieve high-fidelity modeling blueprints (e.g., rounded corners, SubD topology).

## `get_object_details`

Deep dive into an object's mesh, materials, modifiers, and animation status.

## `get_scene_summary`

Comprehensive scene map: objects, collections, modes, and active selection.

## `get_screenshot`

Capture high-speed viewport screenshot (returns base64).

## `navigation`

Jump to a specific tab, workspace, or focus an object in the 3D view.

Actions: `jump_to_tab`, `focus_object`, `focus_data`.

## `render_output`

Render the current scene or viewport.

## `save_blend`

Save current Blender file or a copy.
