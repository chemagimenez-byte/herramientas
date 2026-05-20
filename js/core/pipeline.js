(function () {
  const state = window.MultiTraceState;
  const ui = window.MultiTraceUI;
  const zipCore = window.MultiTraceZip;
  const downloadsCore = window.MultiTraceDownloads;

  async function processSingleFile(file, options) {
    return zipCore.processZip(file, options);
  }

  async function processBatch() {
    ui.clearResults();
    ui.clearLog();
    state.downloads.clear();
    state.batchResults.length = 0;

    if (!state.files.length) {
      ui.log("No hay archivos para procesar.");
      ui.setUiState();
      return;
    }

    state.processing = true;
    ui.setUiState();

    try {
      ui.log(`Inicio de procesado: ${state.files.length} archivo(s).`);

      const startTime = performance.now();
      const total = state.files.length;

      for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];

        ui.setProgress(i, total, `Preparando ${i + 1} de ${total}: ${file.name}`);
        ui.log(`Procesando ${i + 1} / ${total}: ${file.name}`);

        try {
          const processed = await processSingleFile(file, {
            debug: ui.dom.debugMode.checked,
            force: ui.dom.forceReinject.checked,
            strictMode: ui.dom.strictMode ? ui.dom.strictMode.checked : false
          });

          let id = null;

          if (processed.downloadable !== false) {
            id = crypto.randomUUID();

            state.downloads.set(id, {
              blob: processed.blob,
              filename: processed.outputName
            });

            state.batchResults.push({
              originalName: file.name,
              outputName: processed.outputName,
              blob: processed.blob,
              message: processed.message
            });
          }

		  ui.renderResult({
		    id,
		    ok: true,
		    already: !!processed.already,
		    downloadable: processed.downloadable !== false,
		    name: file.name,
		    systemLabel: processed.systemLabel || processed.packageType || "Sistema no identificado",
		    message: processed.message
		  });

          if (processed.already) {
            ui.log(`${file.name}: YA TENÍA TRAZA${processed.packageType ? ` (${processed.packageType})` : ""}`);
          } else {
            ui.log(`${file.name}: TRAZA INSERTADA${processed.packageType ? ` (${processed.packageType})` : ""}`);
          }
        } catch (error) {
          ui.renderResult({
            ok: false,
            name: file.name,
            message: error.message || "Error desconocido"
          });

          ui.log(`${file.name}: ERROR - ${error.message}`);
        }

        ui.setProgress(i + 1, total, `Procesados ${i + 1} de ${total}`);
      }

      const info = downloadsCore.getBatchSizeInfo(state.batchResults);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      if (state.batchResults.length > 0) {
        ui.log(`Procesado completado. Resultados válidos: ${info.count}. Tamaño total descargable: ${window.MultiTraceUtils.formatBytes(info.totalBytes)}.`);
      } else {
        ui.log("Procesado completado sin resultados descargables.");
      }

      ui.log(`Procesado completado en ${elapsed} segundos.`);
    } finally {
      state.processing = false;
      ui.setUiState();
    }
  }

  window.MultiTracePipeline = {
    processSingleFile,
    processBatch
  };
})();