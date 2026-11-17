/**
 * Pure tool routing and Blender source generation.
 *
 * Everything here is free of sockets, filesystem access, and process
 * spawning so it can be unit tested without a running Blender instance.
 * `index.ts` imports these helpers to keep request handling identical.
 */

/** `get_blendfile_summary` argument to body tool-code mapping. */
export const BLENDFILE_SUMMARY_TOOLS: Record<string, string> = {
  datablocks: "get_blendfile_summary_datablocks",
  missing_files: "get_blendfile_summary_missing_files",
  linked_libraries: "get_blendfile_summary_of_linked_libraries",
  path_info: "get_blendfile_summary_path_info",
  usage_guess: "get_blendfile_summary_usage_guess",
};

/** Default output path for `render_output`. */
export const DEFAULT_RENDER_PATH = "render.png";
/** Default output path for `get_fast_feedback`. */
export const DEFAULT_FEEDBACK_PATH = "critic_feedback.png";
/** Default viewport scale percentage for `get_fast_feedback`. */
export const DEFAULT_FEEDBACK_SCALE = 30;

/**
 * Resolve the body tool-code name for a `get_blendfile_summary` request.
 *
 * Unknown types produce an undefined tool name, which surfaces as a
 * missing-file error in the caller (unchanged pre-existing behaviour).
 */
export function resolveSummaryTool(type: unknown): string {
  return BLENDFILE_SUMMARY_TOOLS[String(type)];
}

/** Resolve the body tool-code name for a `navigation` request. */
export function resolveNavigationTool(action: unknown): string {
  if (action === "jump_to_tab") return "jump_to_tab_by_name";
  if (action === "focus_object") return "jump_to_view3d_object_by_name";
  return "jump_to_view3d_object_data_by_name";
}

/** Resolve the body tool-code name for a `render_output` request. */
export function resolveRenderTool(type: unknown): string {
  return type === "viewport" ? "render_viewport_to_path" : "render_thumbnail_to_path";
}

/** Resolve the output path for `render_output`, applying the default. */
export function resolveRenderPath(outputPath: unknown): string {
  return String(outputPath || DEFAULT_RENDER_PATH);
}

/** Clamp `get_fast_feedback`'s resolution scale to 1-100, defaulting to 30. */
export function clampResolutionScale(scale: unknown): number {
  return Math.min(100, Math.max(1, Number(scale) || DEFAULT_FEEDBACK_SCALE));
}

/**
 * Build the Python source for `save_blend`.
 *
 * The path is embedded as a JSON string literal, which is also a valid
 * Python literal, so quotes and newlines cannot break out of the string.
 */
export function buildSaveBlendCode(filepath: unknown, asCopy: unknown): string {
  const copyFlag = asCopy ? ", copy=True" : "";
  const filepathLiteral = JSON.stringify(String(filepath));
  return `import bpy; bpy.ops.wm.save_as_mainfile(filepath=${filepathLiteral}${copyFlag})\nresult={"status":"saved"}`;
}

/** Build the Python source for `get_fast_feedback`. */
export function buildFastFeedbackCode(outputPath: unknown, resolutionScale: unknown): string {
  const fastPath = JSON.stringify(String(outputPath || DEFAULT_FEEDBACK_PATH));
  const scale = clampResolutionScale(resolutionScale);
  return `result = helpers.get_fast_feedback(${fastPath}, resolution_scale=${scale})`;
}

/** Serialize tool parameters as a quoted Python-to-JSON string literal. */
export function serializeToolParams(params: unknown): string {
  return JSON.stringify(JSON.stringify(params));
}

/** Append the standard parameter-unpacking wrapper to body tool-code. */
export function buildToolCode(source: string, params: unknown): string {
  const paramsJson = serializeToolParams(params);
  return source + `
import json
try:
    params_dict = json.loads(${paramsJson})
    if 'Params' in locals() or 'Params' in globals():
        p = Params() if params_dict is None else Params(**params_dict)
    else:
        p = params_dict
    _rv = main(p)
    if callable(_rv):
        check_is_finished = _rv
        result = {}
    else:
        result = _rv._asdict() if hasattr(_rv, "_asdict") else _rv
except Exception as e:
    import traceback
    result = {"status": "error", "message": str(e), "trace": traceback.format_exc()}
`;
}

/**
 * Build the argv for the API-docs bridge.
 *
 * An argument vector keeps the identifier out of any shell, so hostile
 * input stays a single, inert argument.
 */
export function buildApiDocsArgv(interpreter: string, bridgePath: string, identifier: unknown): string[] {
  return [interpreter, bridgePath, String(identifier)];
}
