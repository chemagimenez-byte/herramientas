(function () {
  const config = window.MultiTraceConfig;

  const PATCH_START = `/* --- ${config.patchSignaturePrefix} RISE v${config.patchVersion} START --- */`;
  const PATCH_END = `/* --- ${config.patchSignaturePrefix} RISE v${config.patchVersion} END --- */`;

  const PATCH_REGEX = {
    block: /\/\*\s*---\s*MAINJOBS(?:\s+RISE)?\s+(?:SCORM\s+)?TRACE PATCH(?:\s+RISE)?(?:\s+v[\d.]+)?\s+START\s*---\s*\*\/[\s\S]*?\/\*\s*---\s*MAINJOBS(?:\s+RISE)?\s+(?:SCORM\s+)?TRACE PATCH(?:\s+RISE)?(?:\s+v[\d.]+)?\s+END\s*---\s*\*\//gi,
    start: /\/\*\s*---\s*MAINJOBS(?:\s+RISE)?\s+(?:SCORM\s+)?TRACE PATCH(?:\s+RISE)?(?:\s+v[\d.]+)?\s+START\s*---\s*\*\//i,
    end: /\/\*\s*---\s*MAINJOBS(?:\s+RISE)?\s+(?:SCORM\s+)?TRACE PATCH(?:\s+RISE)?(?:\s+v[\d.]+)?\s+END\s*---\s*\*\//i
  };

  function buildPatch(debugEnabled) {
    return `
${PATCH_START}
document.addEventListener("DOMContentLoaded", function () {
(function () {
  var TRACE_VERSION = "RISE-SCORM-TRACE ${config.patchVersion}";
  var DEBUG = ${debugEnabled ? "true" : "false"};
  var SAVE_INTERVAL = 5000;
  var FORCE_SAVE_TIME = 15000;
  var COMPLETION_THRESHOLD = 95;
  var lastProgress = -1;
  var lastSavedTime = 0;

  function log() { if (!DEBUG || !window.console) return; console.log.apply(console, ["[RISE-MULTI-TRACE]"].concat([].slice.call(arguments))); }
  function warn() { if (!DEBUG || !window.console) return; console.warn.apply(console, ["[RISE-MULTI-TRACE]"].concat([].slice.call(arguments))); }
  function err() { if (!DEBUG || !window.console) return; console.error.apply(console, ["[RISE-MULTI-TRACE]"].concat([].slice.call(arguments))); }

  function getLmsProgress() {
    try {
      if (typeof getLMSData === "function") {
        var lmsData = getLMSData();
        if (lmsData && lmsData.progress && lmsData.progress.p !== undefined) {
          var p = parseFloat(lmsData.progress.p);
          if (!isNaN(p)) return p;
        }
      }
    } catch (e) { warn("Error leyendo getLMSData()", e); }
    return null;
  }

  function getRuntimeProgress() {
    try {
      if (window.Runtime && typeof window.Runtime.getProgress === "function") {
        var data = window.Runtime.getProgress();
        if (data && data.progress && data.progress.p !== undefined) {
          var p = parseFloat(data.progress.p);
          if (!isNaN(p)) return p;
        }
      }
    } catch (e) { warn("Error leyendo Runtime.getProgress()", e); }
    return null;
  }

  function getProgress() {
    var p = getLmsProgress();
    if (p !== null) return p;
    p = getRuntimeProgress();
    if (p !== null) return p;
    return null;
  }

  function findApi(win, depth) {
    if (!win || depth > 20) return null;
    try {
      if (win.API_1484_11) return { type: "2004", api: win.API_1484_11 };
      if (win.API) return { type: "1.2", api: win.API };
    } catch (e) {}
    try {
      if (win.parent && win.parent !== win) {
        var parentApi = findApi(win.parent, depth + 1);
        if (parentApi) return parentApi;
      }
    } catch (e) {}
    try {
      if (win.opener && !win.opener.closed) {
        var openerApi = findApi(win.opener, depth + 1);
        if (openerApi) return openerApi;
      }
    } catch (e) {}
    return null;
  }

  function setValue(apiInfo, key, value) {
    try {
      if (!apiInfo || !apiInfo.api) return null;
      if (apiInfo.type === "2004") return apiInfo.api.SetValue(key, String(value));
      if (apiInfo.type === "1.2") return apiInfo.api.LMSSetValue(key, String(value));
    } catch (e) { err("Error setValue", key, value, e); }
    return null;
  }

  function commit(apiInfo) {
    try {
      if (!apiInfo || !apiInfo.api) return null;
      if (apiInfo.type === "2004") return apiInfo.api.Commit("");
      if (apiInfo.type === "1.2") return apiInfo.api.LMSCommit("");
    } catch (e) { err("Error commit", e); }
    return null;
  }

  function setScore(progress) {
    try {
      if (typeof LMSProxy !== "undefined" && LMSProxy && typeof LMSProxy.SetScore === "function") {
        LMSProxy.SetScore(parseFloat(progress), 100, 0);
        return true;
      }
    } catch (e) { err("Error LMSProxy global", e); }
    try {
      if (window.LMSProxy && typeof window.LMSProxy.SetScore === "function") {
        window.LMSProxy.SetScore(parseFloat(progress), 100, 0);
        return true;
      }
    } catch (e) { err("Error window.LMSProxy", e); }
    return false;
  }

  function saveProgress(force) {
    var progress = getProgress();
    if (progress === null) return;
    progress = Math.max(0, Math.min(100, Math.round(progress)));

    var now = Date.now();
    var changed = progress !== lastProgress;
    var shouldSave = !!force || changed || ((now - lastSavedTime) > FORCE_SAVE_TIME);
    if (!shouldSave) return;

    var scoreOk = setScore(progress);
    var apiInfo = findApi(window, 0);

    if (apiInfo && apiInfo.api) {
      if (apiInfo.type === "2004") {
        setValue(apiInfo, "cmi.score.raw", progress);
        setValue(apiInfo, "cmi.score.min", 0);
        setValue(apiInfo, "cmi.score.max", 100);
        setValue(apiInfo, "cmi.progress_measure", (progress / 100).toFixed(4));
        if (progress >= COMPLETION_THRESHOLD) {
          setValue(apiInfo, "cmi.completion_status", "completed");
          setValue(apiInfo, "cmi.success_status", "passed");
        } else if (progress > 0) {
          setValue(apiInfo, "cmi.completion_status", "incomplete");
        }
      } else if (apiInfo.type === "1.2") {
        setValue(apiInfo, "cmi.core.score.raw", progress);
        setValue(apiInfo, "cmi.core.score.min", 0);
        setValue(apiInfo, "cmi.core.score.max", 100);
        if (progress >= COMPLETION_THRESHOLD) {
          setValue(apiInfo, "cmi.core.lesson_status", "completed");
        } else if (progress > 0) {
          setValue(apiInfo, "cmi.core.lesson_status", "incomplete");
        }
      }
      commit(apiInfo);
    }

    if (scoreOk || apiInfo) {
      lastProgress = progress;
      lastSavedTime = now;
    }
  }

  function flushProgress() { saveProgress(true); }

  setInterval(function () { saveProgress(false); }, SAVE_INTERVAL);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushProgress(); });
  window.addEventListener("pagehide", flushProgress);
  window.addEventListener("beforeunload", flushProgress);
  window.addEventListener("unload", flushProgress);
  setTimeout(function () { saveProgress(true); }, 2000);
})();
});
${PATCH_END}`.trim();
  }

  function hasExistingPatch(html) {
    return PATCH_REGEX.start.test(html) && PATCH_REGEX.end.test(html);
  }

  function removeExistingPatch(html) {
    return html.replace(PATCH_REGEX.block, "");
  }

  function injectIntoHtml(html, patch) {
    const primaryMarker = "}(window));";
    const fallbackMarker = /<\/body>/i;

    if (html.includes(primaryMarker)) {
      return html.replace(primaryMarker, `${patch}\n${primaryMarker}`);
    }

    if (fallbackMarker.test(html)) {
      return html.replace(fallbackMarker, `${patch}\n</body>`);
    }

    return null;
  }

  console.log("[DEBUG] rise-trace.js cargado");

  window.MultiTraceRisePatch = {
    buildPatch,
    hasExistingPatch,
    removeExistingPatch,
    injectIntoHtml
  };
})();
