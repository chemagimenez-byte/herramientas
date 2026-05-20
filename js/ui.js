(function () {
  const state = window.MultiTraceState;
  const utils = window.MultiTraceUtils;

  const dom = {
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    selectBtn: document.getElementById("selectBtn"),
    processBtn: document.getElementById("processBtn"),
    clearBtn: document.getElementById("clearBtn"),
    downloadAllBtn: document.getElementById("downloadAllBtn"),
    downloadEachBtn: document.getElementById("downloadEachBtn"),
    fileList: document.getElementById("fileList"),
    results: document.getElementById("results"),
    logBox: document.getElementById("logBox"),
    debugMode: document.getElementById("debugMode"),
    forceReinject: document.getElementById("forceReinject"),
    strictMode: document.getElementById("strictMode"),
    progressPanel: document.getElementById("progressPanel"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText")
  };

  function log(message) {
    const now = new Date().toLocaleTimeString("es-ES");
    dom.logBox.textContent += `[${now}] ${message}\n`;
    dom.logBox.scrollTop = dom.logBox.scrollHeight;
  }

  function clearLog() {
    dom.logBox.textContent = "";
  }

  function setProgress(current, total, label = "") {
    if (!state.processing || total <= 0) {
      dom.progressPanel.hidden = true;
      dom.progressBar.style.width = "0%";
      dom.progressBar.setAttribute("aria-valuenow", "0");
      dom.progressText.textContent = "";
      return;
    }

    dom.progressPanel.hidden = false;
    const percent = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
    dom.progressBar.style.width = `${percent}%`;
    dom.progressBar.setAttribute("aria-valuenow", String(percent));
    dom.progressText.textContent = label || `Procesando ${current} de ${total} (${percent}%)`;
  }

  function setUiState() {
    const hasFiles = state.files.length > 0;
    const hasResults = state.batchResults.length > 0;

    dom.processBtn.disabled = state.processing || !hasFiles;
    dom.clearBtn.disabled = state.processing;
    dom.selectBtn.disabled = state.processing;
    dom.fileInput.disabled = state.processing;
    dom.debugMode.disabled = state.processing;
    dom.forceReinject.disabled = state.processing;
    dom.strictMode.disabled = state.processing;
    dom.downloadAllBtn.disabled = state.processing || !hasResults;
    dom.downloadEachBtn.disabled = state.processing || !hasResults;

    if (state.processing) {
      dom.dropzone.classList.add("disabled");
    } else {
      dom.dropzone.classList.remove("disabled");
      setProgress(0, 0);
    }
  }

  function renderFiles() {
    if (!state.files.length) {
      dom.fileList.className = "file-list empty";
      dom.fileList.textContent = "No hay archivos cargados.";
      setUiState();
      return;
    }

    dom.fileList.className = "file-list";
    dom.fileList.innerHTML = state.files.map(file => `
      <div class="file-item">
        <strong>${utils.escapeHtml(file.name)}</strong><br>
        <small>${utils.formatBytes(file.size)}</small>
      </div>
    `).join("");

    setUiState();
  }

  function clearResults() {
    dom.results.className = "results empty";
    dom.results.innerHTML = "Todavía no se ha procesado ningún archivo.";
  }

  function renderResult(item) {
    if (dom.results.classList.contains("empty")) {
      dom.results.className = "results";
      dom.results.innerHTML = "";
    }

    const statusClass = item.already ? "already" : item.ok ? "ok" : "error";

    dom.results.insertAdjacentHTML("beforeend", `
      <div class="result-item ${statusClass}">
        <div class="result-header">
          <div>
            <strong>${utils.escapeHtml(item.name)}</strong><br>
            <small class="badge">${utils.escapeHtml(item.systemLabel || "Sistema no identificado")}</small><br>
            <small>${utils.escapeHtml(item.message)}</small>
          </div>
        </div>
        ${item.ok && item.downloadable ? `
          <div class="result-actions">
            <button type="button" data-download="${item.id}">Descargar ZIP</button>
          </div>
        ` : ""}
      </div>
    `);
  }

  window.MultiTraceUI = {
    dom,
    log,
    clearLog,
    setProgress,
    setUiState,
    renderFiles,
    clearResults,
    renderResult
  };
})();
