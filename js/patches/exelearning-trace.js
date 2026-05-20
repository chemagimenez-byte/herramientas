(function () {
  const config = window.MultiTraceConfig;
  const PATCH_START = `/* --- ${config.patchSignaturePrefix} EXELEARNING v${config.patchVersion} START --- */`;
  const PATCH_END = `/* --- ${config.patchSignaturePrefix} EXELEARNING v${config.patchVersion} END --- */`;

  function buildPatch(debugEnabled, totalPages, currentPageId) {
    const safePageId = String(currentPageId || "").replace(/"/g, '\\"');

    return `
${PATCH_START}
window.__EXE_TOTAL_PAGES = ${totalPages};
window.__EXE_PAGE_ID = "${safePageId}";
(function() {

  var TRACE_VERSION = "EXELEARNING-TRACE ${config.patchVersion}";
  var DEBUG = ${debugEnabled ? "true" : "false"};
  var SAVE_INTERVAL = 5000;
  var FORCE_SAVE_TIME = 15000;
  var COMPLETION_THRESHOLD = 95;

  var SESSION_KEY = "mainjobs_exe_trace_v${config.patchVersion}";
  var SUSPEND_DATA_KEY = "cmi.suspend_data";

  var totalPages = window.__EXE_TOTAL_PAGES || 1;
  var currentPageId = window.__EXE_PAGE_ID || "";

  var lastProgress = -1;
  var lastSavedTime = 0;
  var completionLocked = false;

  var apiInfo = null;
  var scormClosed = false;

  function log() {
    if (!DEBUG) return;
    console.log.apply(console, ["[EXE-TRACE]"].concat([].slice.call(arguments)));
  }

  function warn() {
    if (!DEBUG) return;
    console.warn.apply(console, ["[EXE-TRACE]"].concat([].slice.call(arguments)));
  }

  function findApi(win, depth) {
    if (!win || depth > 20) return null;

    try {
      if (win.API_1484_11) return { type: "2004", api: win.API_1484_11 };
      if (win.API) return { type: "1.2", api: win.API };
    } catch(e){}

    try {
      if (win.parent && win.parent !== win) {
        return findApi(win.parent, depth + 1);
      }
    } catch(e){}

    return null;
  }

  function getValue(key) {
    if (!apiInfo || scormClosed) return null;

    try {
      var val = (apiInfo.type === "2004")
        ? apiInfo.api.GetValue(key)
        : apiInfo.api.LMSGetValue(key);

      return val;
    } catch(e) {
      return null;
    }
  }

  function setValue(key, value) {
    if (!apiInfo || scormClosed) return false;

    try {
      var res = (apiInfo.type === "2004")
        ? apiInfo.api.SetValue(key, String(value))
        : apiInfo.api.LMSSetValue(key, String(value));

      return res === true || res === "true";
    } catch(e) {
      return false;
    }
  }

  function commit() {
    if (!apiInfo || scormClosed) return false;

    try {
      var res = (apiInfo.type === "2004")
        ? apiInfo.api.Commit("")
        : apiInfo.api.LMSCommit("");

      return res === true || res === "true";
    } catch(e) {
      return false;
    }
  }

  function getFileName(url) {
    if (!url) return "";
    var clean = url.split("#")[0].split("?")[0];
    return clean.substring(clean.lastIndexOf("/") + 1);
  }

  function isIndexPage() {
    return currentPageId === "index.html";
  }

  function comesFromInternalPage() {
    var ref = document.referrer || "";
    var file = getFileName(ref);
    return file.endsWith(".html");
  }

  function shouldReset() {
    return isIndexPage() && !comesFromInternalPage();
  }

  function resetTrace() {
    sessionStorage.removeItem(SESSION_KEY);

    if (!scormClosed) {
      setValue(SUSPEND_DATA_KEY, JSON.stringify({ pages: [] }));
      commit();
    }

    log("Reset de traza al iniciar paquete");
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      return JSON.parse(raw).pages || [];
    } catch(e) {
      return [];
    }
  }

  function writeSession(pages) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      pages: pages,
      updatedAt: new Date().toISOString()
    }));
  }

  function readSuspend() {
    var raw = getValue(SUSPEND_DATA_KEY);
    if (!raw) return [];

    try {
      return JSON.parse(raw).pages || [];
    } catch(e) {
      return [];
    }
  }

  function writeSuspend(pages) {
    setValue(SUSPEND_DATA_KEY, JSON.stringify({
      pages: pages,
      updatedAt: new Date().toISOString()
    }));
  }

  function mergePages() {
    var map = {};
    var out = [];

    function add(p) {
      if (!p || map[p]) return;
      map[p] = true;
      out.push(p);
    }

    readSession().forEach(add);
    readSuspend().forEach(add);

    return out;
  }

  function getVisited() {
    return new Set(mergePages());
  }

  function saveVisited(set) {
    var arr = Array.from(set);

    writeSession(arr);

    if (!scormClosed) {
      writeSuspend(arr);
    }

    log("Páginas guardadas:", arr);
  }

  function computeProgress() {
    var visited = getVisited();

    if (!visited.has(currentPageId)) {
      visited.add(currentPageId);
      saveVisited(visited);
    }

    var count = visited.size;
    var progress = Math.round((count / totalPages) * 100);

    if (count < totalPages && progress >= COMPLETION_THRESHOLD) {
      progress = COMPLETION_THRESHOLD - 1;
    }

    if (count >= totalPages) {
      progress = 100;
    }

    log("Progreso:", count + "/" + totalPages);

    return progress;
  }

  function setScore(progress) {
    if (apiInfo.type === "1.2") {
      setValue("cmi.core.score.raw", progress);
      setValue("cmi.core.lesson_status", progress >= COMPLETION_THRESHOLD ? "completed" : "incomplete");
    } else {
      setValue("cmi.score.raw", progress);
      setValue("cmi.completion_status", progress >= COMPLETION_THRESHOLD ? "completed" : "incomplete");
    }
  }

  function saveProgress(force) {
    var now = Date.now();
    var progress = computeProgress();

    var shouldSave = force ||
      progress !== lastProgress ||
      (now - lastSavedTime > FORCE_SAVE_TIME);

    if (!shouldSave) return;

    setScore(progress);
    commit();

    lastProgress = progress;
    lastSavedTime = now;

    log("Guardado:", progress + "%");
  }

  function init() {
    apiInfo = findApi(window, 0);

    if (!apiInfo) return;

    log("Init:", currentPageId);

    if (shouldReset()) {
      resetTrace();
    }

    saveProgress(true);

    setInterval(function() {
      saveProgress(false);
    }, SAVE_INTERVAL);

    window.addEventListener("beforeunload", function() {
      saveProgress(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
${PATCH_END}`.trim();
  }

  function hasExistingPatch(html) {
    return /EXELEARNING TRACE/.test(html);
  }

  function removeExistingPatch(html) {
    return html.replace(/<script[^>]*>[\s\S]*?EXELEARNING TRACE[\s\S]*?<\/script>/gi, '');
  }

  function injectIntoHtml(html, patch) {
    const scriptTag = `<script>\n${patch}\n</script>`;
    return html.replace(/<\/body>/i, scriptTag + "\n</body>");
  }

  window.MultiTraceExeLearningPatch = {
    buildPatch,
    hasExistingPatch,
    removeExistingPatch,
    injectIntoHtml
  };
})();