(function () {
  const PATCH_FILE_PATH = "mainjobs/storyline-trace.js";

  const BLOCK_START = "<!-- MAINJOBS STORYLINE TRACE START -->";
  const BLOCK_END = "<!-- MAINJOBS STORYLINE TRACE END -->";

  const BLOCK_REGEX = /<!--\s*MAINJOBS STORYLINE TRACE START\s*-->[\s\S]*?<!--\s*MAINJOBS STORYLINE TRACE END\s*-->/gi;

  function buildPatch(debugEnabled) {
    return `
(function () {

var TRACE_VERSION = "STORYLINE-SCORM-TRACE 1.9.1";
var DEBUG = ${debugEnabled ? "true" : "false"};

var SAVE_INTERVAL = 5000;
var FORCE_SAVE_TIME = 15000;
var COMPLETION_THRESHOLD = 90;
var MAX_ATTEMPTS = 120;

var playerRef = null;
var attempts = 0;
var lastSavedAt = 0;
var lastProgress = null;

var completionLocked = false;
var completionGuardInstalled = false;

function log() {
  if (!DEBUG || !window.console) return;
  console.log.apply(console, ["[STORYLINE-MULTI-TRACE]"].concat([].slice.call(arguments)));
}

function warn() {
  if (!DEBUG || !window.console) return;
  console.warn.apply(console, ["[STORYLINE-MULTI-TRACE]"].concat([].slice.call(arguments)));
}

function err() {
  if (!DEBUG || !window.console) return;
  console.error.apply(console, ["[STORYLINE-MULTI-TRACE]"].concat([].slice.call(arguments)));
}

function tryGetPlayerFrom(win, label) {
  try {
    if (win && typeof win.GetPlayer === "function") {
      var player = win.GetPlayer();
      if (player) {
        log("Player encontrado en", label);
        return player;
      }
    }
  } catch (e) {
    warn("Error probando GetPlayer en " + label, e);
  }
  return null;
}

function scanFrames(win, path, depth) {
  depth = depth || 0;
  if (!win || depth > 5) return null;

  var player = tryGetPlayerFrom(win, path);
  if (player) return player;

  try {
    if (win.frames && win.frames.length) {
      for (var i = 0; i < win.frames.length; i++) {
        var child = win.frames[i];
        var found = scanFrames(child, path + ".frames[" + i + "]", depth + 1);
        if (found) return found;
      }
    }
  } catch (e) {
    warn("No se pueden inspeccionar frames de " + path, e);
  }

  return null;
}

function findApi(win, depth) {
  depth = depth || 0;
  if (!win || depth > 20) return null;

  try {
    if (win.API_1484_11) return { type: "2004", api: win.API_1484_11, where: "depth:" + depth };
    if (win.API) return { type: "1.2", api: win.API, where: "depth:" + depth };
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

  try {
    if (typeof win.SetScore === "function") {
      return { type: "proxy", api: win, where: "depth:" + depth };
    }
  } catch (e) {}

  return null;
}

function normalizeProgress(value) {
  var n = parseFloat(value);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isResumePromptActive() {
  try {
    if (!window.DS || !window.DS.presentation || !window.DS.presentation.attributes) {
      return false;
    }

    var attrs = window.DS.presentation.attributes;
    var resume = attrs.resume;
    var slideMap = attrs.slideMap;

    if (!resume || !resume.slideId || !slideMap) return false;

    var currentSlideId = slideMap.currentSlideId || slideMap.lastSlideId || null;

    log("Resume prompt check", {
      currentSlideId: currentSlideId,
      resumeSlideId: resume.slideId,
      active: currentSlideId === resume.slideId
    });

    return currentSlideId === resume.slideId;
  } catch (e) {
    warn("Error comprobando resume prompt", e);
    return false;
  }
}

function hasPersistedResumeData() {
  try {
    if (!window.DS || !window.DS.resumer) return false;

    var resumer = window.DS.resumer;

    if (typeof resumer.getViewedSlidesString === "function") {
      var viewedString = resumer.getViewedSlidesString();
      if (viewedString && viewedString.length > 0) return true;
    }

    if (resumer.resumeData && resumer.resumeData.attributes) {
      var attrs = resumer.resumeData.attributes;
      if (
        (typeof attrs.encodedString === "string" && attrs.encodedString.length > 0) ||
        (typeof attrs.remainder === "string" && attrs.remainder.length > 0)
      ) {
        return true;
      }
    }

    return false;
  } catch (e) {
    warn("Error comprobando resumeData", e);
    return false;
  }
}

function isResumePending() {
  try {
    if (!window.DS || !window.DS.resumer) return false;

    var resumer = window.DS.resumer;
    var persisted = hasPersistedResumeData();
    var accumulated = null;

    try {
      if (typeof resumer.getUniqueTotalSlides === "function") {
        var slides = resumer.getUniqueTotalSlides();
        if (Array.isArray(slides)) accumulated = slides.length;
      }
    } catch (e) {}

    var pending = persisted && accumulated === 0;

    log("Resume pending check", {
      persisted: persisted,
      accumulated: accumulated,
      pending: pending
    });

    return pending;
  } catch (e) {
    warn("Error comprobando resume pendiente", e);
    return false;
  }
}

function readProgress() {
  try {
    if (!window.DS || !window.DS.resumer || !window.DS.presentation || !window.DS.presentation.attributes) {
      warn("Estructuras DS no disponibles");
      return null;
    }

    var viewed = null;
    var total = null;

    try {
      if (typeof window.DS.resumer.getUniqueTotalSlides === "function") {
        var accumulatedSlides = window.DS.resumer.getUniqueTotalSlides();
        if (Array.isArray(accumulatedSlides)) {
          viewed = accumulatedSlides.length;
        }
      }
    } catch (e) {
      warn("Error getUniqueTotalSlides()", e);
    }

    try {
      total = parseInt(window.DS.presentation.attributes.slideCount, 10);
      if (isNaN(total)) total = null;
    } catch (e) {
      warn("Error leyendo slideCount", e);
    }

    log("readProgress: viewed", viewed, "total", total);

    if (typeof viewed === "number" && typeof total === "number" && total > 0) {
      var progress = normalizeProgress((viewed / total) * 100);

      if (progress >= COMPLETION_THRESHOLD) {
        progress = 100;
      }

      log("readProgress: progreso calculado", progress);
      return progress;
    }

    return null;
  } catch (e) {
    err("Error leyendo progreso", e);
    return null;
  }
}

function setValue(apiInfo, key, value) {
  try {
    if (!apiInfo || !apiInfo.api) return null;
    if (apiInfo.type === "2004") return apiInfo.api.SetValue(key, String(value));
    if (apiInfo.type === "1.2") return apiInfo.api.LMSSetValue(key, String(value));
  } catch (e) {
    err("Error setValue", key, value, e);
  }
  return null;
}

function getValue(apiInfo, key) {
  try {
    if (!apiInfo || !apiInfo.api) return null;
    if (apiInfo.type === "2004") return apiInfo.api.GetValue(key);
    if (apiInfo.type === "1.2") return apiInfo.api.LMSGetValue(key);
  } catch (e) {
    err("Error getValue", key, e);
  }
  return null;
}

function commit(apiInfo) {
  try {
    if (!apiInfo || !apiInfo.api) return null;
    if (apiInfo.type === "2004") return apiInfo.api.Commit("");
    if (apiInfo.type === "1.2") return apiInfo.api.LMSCommit("");
    if (apiInfo.type === "proxy" && typeof apiInfo.api.CommitData === "function") {
      return apiInfo.api.CommitData();
    }
  } catch (e) {
    err("Error commit", e);
  }
  return null;
}

function getLmsCompletionSnapshot(apiInfo) {
  try {
    if (!apiInfo) return { completed: false, score: null };

    if (apiInfo.type === "2004") {
      var completion2004 = getValue(apiInfo, "cmi.completion_status");
      var success2004 = getValue(apiInfo, "cmi.success_status");
      var score2004 = parseFloat(getValue(apiInfo, "cmi.score.raw"));
      return {
        completed: completion2004 === "completed" || success2004 === "passed",
        score: isNaN(score2004) ? null : score2004
      };
    }

    if (apiInfo.type === "1.2") {
      var lessonStatus = getValue(apiInfo, "cmi.core.lesson_status");
      var score12 = parseFloat(getValue(apiInfo, "cmi.core.score.raw"));
      return {
        completed: lessonStatus === "completed" || lessonStatus === "passed",
        score: isNaN(score12) ? null : score12
      };
    }
  } catch (e) {
    warn("Error leyendo snapshot LMS", e);
  }

  return { completed: false, score: null };
}

function isAttemptAlreadyCompleted(apiInfo) {
  try {
    var snapshot = getLmsCompletionSnapshot(apiInfo);
    return !!snapshot.completed;
  } catch (e) {
    warn("Error comprobando estado completado del intento", e);
    return false;
  }
}

function shouldLockCompletion(apiInfo, progress) {
  try {
    if (typeof progress === "number" && progress >= COMPLETION_THRESHOLD) {
      return true;
    }

    var snapshot = getLmsCompletionSnapshot(apiInfo);
    if (snapshot.completed) return true;
    if (typeof snapshot.score === "number" && snapshot.score >= COMPLETION_THRESHOLD) return true;
  } catch (e) {
    warn("Error evaluando bloqueo de completion", e);
  }

  return false;
}

function installCompletionGuard(apiInfo) {
  try {
    if (completionGuardInstalled || !apiInfo || !apiInfo.api) return;

    if (apiInfo.type === "1.2") {
      var originalSet12 = apiInfo.api.LMSSetValue;
      apiInfo.api.LMSSetValue = function (key, value) {
        try {
          if (completionLocked) {
            var lower = String(value).toLowerCase();

            if (key === "cmi.core.lesson_status" && lower === "incomplete") {
              log("Bloqueada degradación de lesson_status a incomplete");
              return "true";
            }

            if (key === "cmi.core.exit" && lower === "suspend") {
              log("Bloqueada degradación de exit a suspend");
              return "true";
            }
          }
        } catch (e) {}
        return originalSet12.apply(this, arguments);
      };
      completionGuardInstalled = true;
      log("Completion guard instalado para SCORM 1.2");
      return;
    }

    if (apiInfo.type === "2004") {
      var originalSet2004 = apiInfo.api.SetValue;
      apiInfo.api.SetValue = function (key, value) {
        try {
          if (completionLocked) {
            var low = String(value).toLowerCase();

            if (key === "cmi.completion_status" && low === "incomplete") {
              log("Bloqueada degradación de completion_status a incomplete");
              return "true";
            }

            if (key === "cmi.success_status" && low === "unknown") {
              log("Bloqueada degradación de success_status a unknown");
              return "true";
            }

            if (key === "cmi.exit" && low === "suspend") {
              log("Bloqueada degradación de exit a suspend");
              return "true";
            }
          }
        } catch (e) {}
        return originalSet2004.apply(this, arguments);
      };
      completionGuardInstalled = true;
      log("Completion guard instalado para SCORM 2004");
    }
  } catch (e) {
    warn("Error instalando completion guard", e);
  }
}

function touchCompletion(apiInfo, progress) {
  try {
    if (!apiInfo || !apiInfo.api) return;

    if (shouldLockCompletion(apiInfo, progress)) {
      completionLocked = true;
    }

    var snapshot = getLmsCompletionSnapshot(apiInfo);

    if (apiInfo.type === "2004") {
      if (completionLocked || progress >= COMPLETION_THRESHOLD || snapshot.completed) {
        setValue(apiInfo, "cmi.completion_status", "completed");
        setValue(apiInfo, "cmi.success_status", "passed");
        setValue(apiInfo, "cmi.exit", "");
      } else if (progress > 0 && !snapshot.completed) {
        setValue(apiInfo, "cmi.completion_status", "incomplete");
      }
    }

    if (apiInfo.type === "1.2") {
      if (completionLocked || progress >= COMPLETION_THRESHOLD || snapshot.completed) {
        setValue(apiInfo, "cmi.core.lesson_status", "completed");
        setValue(apiInfo, "cmi.core.exit", "");
      } else if (progress > 0 && !snapshot.completed) {
        setValue(apiInfo, "cmi.core.lesson_status", "incomplete");
      }
    }
  } catch (e) {
    err("Error touchCompletion", e);
  }
}

function preserveCompletedStateDuringResume(apiInfo) {
  try {
    var snapshot = getLmsCompletionSnapshot(apiInfo);

    if (snapshot.completed || (typeof snapshot.score === "number" && snapshot.score >= COMPLETION_THRESHOLD)) {
      completionLocked = true;
      log("Preservando estado completado durante resume", snapshot);

      if (typeof snapshot.score === "number") {
        setScore(apiInfo, snapshot.score);
      }

      touchCompletion(apiInfo, 100);
      commit(apiInfo);

      return true;
    }
  } catch (e) {
    warn("Error preservando estado completado", e);
  }

  return false;
}

function setScore(apiInfo, progress) {
  try {
    if (!apiInfo || !apiInfo.api) return false;

    if (apiInfo.type === "proxy" && typeof apiInfo.api.SetScore === "function") {
      apiInfo.api.SetScore(progress, 100, 0);
      log("SetScore vía proxy", progress);
      return true;
    }

    if (apiInfo.type === "2004") {
      setValue(apiInfo, "cmi.score.raw", progress);
      setValue(apiInfo, "cmi.score.min", 0);
      setValue(apiInfo, "cmi.score.max", 100);
      setValue(apiInfo, "cmi.progress_measure", (progress / 100).toFixed(4));
      return true;
    }

    if (apiInfo.type === "1.2") {
      setValue(apiInfo, "cmi.core.score.raw", progress);
      setValue(apiInfo, "cmi.core.score.min", 0);
      setValue(apiInfo, "cmi.core.score.max", 100);
      return true;
    }
  } catch (e) {
    err("Error setScore", e);
  }

  return false;
}

function save(force) {
  var apiInfo = findApi(window, 0);

  if (!apiInfo) {
    warn("No se ha encontrado API LMS");
    return;
  }

  if (isResumePromptActive() || isResumePending()) {
    preserveCompletedStateDuringResume(apiInfo);
    log("Resume pendiente o pantalla de resume — no guardar");
    return;
  }

  if (isAttemptAlreadyCompleted(apiInfo)) {
    preserveCompletedStateDuringResume(apiInfo);
    log("Intento ya completado en LMS — modo solo lectura, no se guarda progreso");
    return;
  }

  var progress = readProgress();
  var now = Date.now();
  var changed = progress !== null && progress !== lastProgress;
  var shouldSave = !!force || changed || ((now - lastSavedAt) > FORCE_SAVE_TIME);

  if (!shouldSave) return;

  if (progress !== null) {
    if (shouldLockCompletion(apiInfo, progress)) {
      completionLocked = true;
    }

    setScore(apiInfo, progress);
    touchCompletion(apiInfo, progress);
    lastProgress = progress;
    log("Score sincronizado", progress);
  }

  commit(apiInfo);
  lastSavedAt = now;
  log("Commit realizado");
}

function flush() {
  log("flush()");
  save(true);
}

function waitForPlayer() {
  attempts += 1;

  if (attempts === 1) {
    log("Parche cargado", TRACE_VERSION);
  }

  playerRef =
    tryGetPlayerFrom(window, "window") ||
    tryGetPlayerFrom(window.parent, "parent") ||
    tryGetPlayerFrom(window.top, "top") ||
    scanFrames(window, "window", 0);

  if (playerRef) {
    log("Player inicializado correctamente");
    startTracking();
    return;
  }

  if (attempts < MAX_ATTEMPTS) {
    setTimeout(waitForPlayer, 500);
  } else {
    err("No se encontró player Storyline");
  }
}

function startTracking() {
  log("startTracking()");

  var apiInfo = findApi(window, 0);
  if (apiInfo) {
    log("API LMS detectada", apiInfo.type, apiInfo.where);
    installCompletionGuard(apiInfo);
  }

  setTimeout(function () {
    log("Primer guardado diferido");
    save(true);
  }, 2000);

  setInterval(function () {
    save(false);
  }, SAVE_INTERVAL);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  window.addEventListener("unload", flush);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    log("DOMContentLoaded");
    waitForPlayer();
  });
} else {
  waitForPlayer();
}

window.addEventListener("load", function () {
  log("window.load");
});

})();
`.trim();
  }

  function hasExistingPatch(html) {
    return html.includes(BLOCK_START) && html.includes(BLOCK_END);
  }

  function removeExistingPatch(html) {
    return html.replace(BLOCK_REGEX, "");
  }

  function buildScriptTag() {
    return [
      BLOCK_START,
      `<script src="${PATCH_FILE_PATH}"></script>`,
      BLOCK_END
    ].join("\n");
  }

  function injectIntoHtml(html) {
    var scriptTag = buildScriptTag();

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    }

    if (/<\/html>/i.test(html)) {
      return html.replace(/<\/html>/i, `${scriptTag}\n</html>`);
    }

    return null;
  }

  window.MultiTraceStorylinePatch = {
    patchFilePath: PATCH_FILE_PATH,
    buildPatch,
    hasExistingPatch,
    removeExistingPatch,
    injectIntoHtml
  };
})();