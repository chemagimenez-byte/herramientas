(function () {
  const config = window.MultiTraceConfig;
  const state = window.MultiTraceState;
  const ui = window.MultiTraceUI;
  const downloadsCore = window.MultiTraceDownloads;
  const pipeline = window.MultiTracePipeline;
  const utils = window.MultiTraceUtils;

  function setFiles(fileListObj) {
    if (state.processing) return;
    state.files = Array.from(fileListObj).filter(file => file.name.toLowerCase().endsWith(".zip"));
    ui.renderFiles();
  }

  ui.dom.dropzone.addEventListener("click", () => {
    if (!state.processing) ui.dom.fileInput.click();
  });

  ui.dom.selectBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!state.processing) ui.dom.fileInput.click();
  });

  ui.dom.fileInput.addEventListener("change", (e) => setFiles(e.target.files));

  ui.dom.dropzone.addEventListener("dragover", (e) => {
    if (state.processing) return;
    e.preventDefault();
    ui.dom.dropzone.classList.add("dragover");
  });

  ui.dom.dropzone.addEventListener("dragleave", () => ui.dom.dropzone.classList.remove("dragover"));

  ui.dom.dropzone.addEventListener("drop", (e) => {
    if (state.processing) return;
    e.preventDefault();
    ui.dom.dropzone.classList.remove("dragover");
    setFiles(e.dataTransfer.files);
  });

  ui.dom.clearBtn.addEventListener("click", () => {
    if (state.processing) return;
    state.files = [];
    ui.dom.fileInput.value = "";
    state.downloads.clear();
    state.batchResults.length = 0;
    ui.renderFiles();
    ui.clearResults();
    ui.clearLog();
    ui.setUiState();
  });

  ui.dom.results.addEventListener("click", (e) => {
    const button = e.target.closest("[data-download]");
    if (!button || state.processing) return;
    const item = state.downloads.get(button.dataset.download);
    if (!item) return;
    downloadsCore.downloadBlob(item.blob, item.filename);
  });

  ui.dom.downloadAllBtn.addEventListener("click", async () => {
    if (state.processing) return;

    try {
      const info = downloadsCore.getBatchSizeInfo(state.batchResults);
      if (info.count > config.maxBundleFiles || info.totalBytes > config.maxBundleSize) {
        ui.log(`Lote demasiado grande para descarga agrupada: ${info.count} archivos, ${utils.formatBytes(info.totalBytes)}.`);
        alert(
          `El lote es demasiado grande para generar trazabilidad.zip en el navegador.\n\n` +
          `Archivos: ${info.count}\n` +
          `Tamaño total: ${utils.formatBytes(info.totalBytes)}\n\n` +
          `Usa la descarga individual o divide el lote.`
        );
        return;
      }

      ui.log(`Generando trazabilidad.zip (${info.count} archivos, ${utils.formatBytes(info.totalBytes)})...`);
      ui.dom.downloadAllBtn.disabled = true;
      ui.dom.downloadEachBtn.disabled = true;
      await downloadsCore.downloadAllResults(state.batchResults, ui.dom.logBox.textContent);
      ui.log("Se ha generado trazabilidad.zip");
    } catch (error) {
      ui.log(`Error al generar trazabilidad.zip: ${error.message}`);
    } finally {
      ui.setUiState();
    }
  });

  ui.dom.downloadEachBtn.addEventListener("click", async () => {
    if (state.processing) return;

    try {
      if (!state.batchResults.length) {
        ui.log("No hay archivos para descargar.");
        return;
      }

      ui.dom.downloadAllBtn.disabled = true;
      ui.dom.downloadEachBtn.disabled = true;
      ui.log(`Lanzando descarga individual de ${state.batchResults.length} archivos...`);
      await downloadsCore.downloadSequentially(state.batchResults);
      ui.log("Descarga individual completada.");
    } catch (error) {
      ui.log(`Error en descarga individual: ${error.message}`);
    } finally {
      ui.setUiState();
    }
  });

  ui.dom.processBtn.addEventListener("click", pipeline.processBatch);

  ui.renderFiles();
  ui.clearResults();
  ui.setUiState();
})();
