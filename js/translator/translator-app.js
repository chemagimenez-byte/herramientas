(function () {
  const state = window.MultiTraceState;
  const ui = window.MultiTraceUI;
  const downloadsCore = window.MultiTraceDownloads;
  const translatorCore = window.MultiTraceTranslatorCore;
  const translatorService = window.MultiTraceTranslator;

  // Estado específico del traductor
  const translatorState = {
    serviceReady: false,
    translating: false,
    currentFileIndex: 0
  };

  // Referencias al DOM específicas
  const dom = {
    sourceLang: document.getElementById('sourceLang'),
    targetLang: document.getElementById('targetLang'),
    forceRetranslate: document.getElementById('forceRetranslate'),
    translateBtn: document.getElementById('translateBtn'),
    serviceStatus: document.getElementById('serviceStatus'),
    fileProgress: document.getElementById('fileProgress')
  };

  // Llenar selectores de idiomas
  function populateLanguageSelectors() {
    const languages = translatorService.getSupportedLanguages();
    
    // Ordenar: primero regionales de España, luego el resto
    const regional = languages.filter(l => l.regional);
    const others = languages.filter(l => !l.regional);
    
    // Llenar selector de origen (con auto ya incluido en HTML)
    [...regional, ...others].forEach(lang => {
      const badge = lang.regional ? ' <span class="language-badge regional">Regional</span>' : '';
      dom.sourceLang.insertAdjacentHTML(
        'beforeend',
        `<option value="${lang.code}">${lang.name}${badge}</option>`
      );
    });

    // Llenar selector de destino (sin auto)
    [...regional, ...others].forEach(lang => {
      const badge = lang.regional ? ' <span class="language-badge regional">Regional</span>' : '';
      dom.targetLang.insertAdjacentHTML(
        'beforeend',
        `<option value="${lang.code}" ${lang.code === 'en' ? 'selected' : ''}>${lang.name}${badge}</option>`
      );
    });
  }

  // Actualizar estado del servicio
  function updateServiceStatus(status, message) {
    dom.serviceStatus.className = `service-status ${status}`;
    
    const messages = {
      connecting: 'Detectando servicio de traducción disponible...',
      connected: message || 'Servicio de traducción conectado correctamente.',
      disconnected: message || 'No se pudo conectar con ningún servicio de traducción.'
    };
    
    dom.serviceStatus.textContent = messages[status] || message;
  }

  // Detectar servicio al iniciar
  async function initializeService() {
    try {
      updateServiceStatus('connecting');
      const detected = await translatorService.detectAvailableService();
      
      if (detected) {
        const serviceName = translatorService.getCurrentService();
        updateServiceStatus('connected', `Servicio activo: ${serviceName === 'LIBRETRANSLATE' ? 'LibreTranslate' : 'MyMemory'}`);
        translatorState.serviceReady = true;
      } else {
        updateServiceStatus('disconnected', 'No se encontró ningún servicio disponible. Verifica tu conexión a internet.');
        translatorState.serviceReady = false;
      }
    } catch (error) {
      console.error('[TRANSLATOR-APP] Error inicializando servicio:', error);
      updateServiceStatus('disconnected', `Error: ${error.message}`);
      translatorState.serviceReady = false;
    }

    updateUiState();
  }

  // Actualizar estado de la UI
  function updateUiState() {
    const hasFiles = state.files.length > 0;
    const canTranslate = hasFiles && translatorState.serviceReady && !translatorState.translating;
    
    dom.translateBtn.disabled = !canTranslate;
    
    if (translatorState.translating) {
      ui.dom.dropzone.classList.add('disabled');
    } else {
      ui.dom.dropzone.classList.remove('disabled');
    }
  }

  // Establecer archivos
  function setFiles(fileListObj) {
    if (translatorState.translating) return;
    state.files = Array.from(fileListObj).filter(file => file.name.toLowerCase().endsWith('.zip'));
    ui.renderFiles();
    updateUiState();
  }

  // Progreso detallado por archivo
  function updateFileProgress(fileName, current, total) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    
    dom.fileProgress.insertAdjacentHTML('beforeend', `
      <div class="file-progress">
        <strong>${fileName}</strong><br>
        <small>Progreso: ${current}/${total} elementos (${percent}%)</small>
      </div>
    `);
    
    dom.fileProgress.scrollTop = dom.fileProgress.scrollHeight;
  }

  // Traducir un archivo individual
  async function translateSingleFile(file, options) {
    return translatorCore.translateZipFile(file, {
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      force: options.force,
      onProgress: (current, total) => {
        ui.setProgress(
          translatorState.currentFileIndex + (current / total),
          state.files.length,
          `Traduciendo ${file.name}: ${Math.round((current / total) * 100)}%`
        );
      }
    });
  }

  // Procesar lote de traducciones
  async function processTranslationBatch() {
    ui.clearResults();
    ui.clearLog();
    state.downloads.clear();
    state.batchResults.length = 0;
    dom.fileProgress.innerHTML = '';

    if (!state.files.length) {
      ui.log('No hay archivos para traducir.');
      updateUiState();
      return;
    }

    if (!translatorState.serviceReady) {
      ui.log('El servicio de traducción no está disponible.');
      alert('El servicio de traducción no está disponible. Verifica tu conexión a internet e inténtalo de nuevo.');
      return;
    }

    translatorState.translating = true;
    translatorState.currentFileIndex = 0;
    updateUiState();

    try {
      ui.log(`Inicio de traducción: ${state.files.length} archivo(s).`);
      ui.log(`Idioma origen: ${dom.sourceLang.value}, Idioma destino: ${dom.targetLang.value}`);

      const startTime = performance.now();
      const total = state.files.length;
      const options = {
        sourceLang: dom.sourceLang.value,
        targetLang: dom.targetLang.value,
        force: dom.forceRetranslate.checked
      };

      for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];
        translatorState.currentFileIndex = i;

        ui.setProgress(i, total, `Preparando ${i + 1} de ${total}: ${file.name}`);
        ui.log(`Traduciendo ${i + 1} / ${total}: ${file.name}`);

        try {
          const translated = await translateSingleFile(file, options);

          let id = null;

          if (translated.downloadable !== false) {
            id = crypto.randomUUID();

            state.downloads.set(id, {
              blob: translated.blob,
              filename: translated.outputName
            });

            state.batchResults.push({
              originalName: file.name,
              outputName: translated.outputName,
              blob: translated.blob,
              message: translated.message
            });
          }

          ui.renderResult({
            id,
            ok: true,
            already: !!translated.already,
            downloadable: translated.downloadable !== false,
            name: file.name,
            systemLabel: translated.packageType ? 
              (translated.packageType === 'rise' ? 'Rise' : 
               translated.packageType === 'storyline' ? 'Storyline 360' : 'eXeLearning') : 
              'Sistema no identificado',
            message: translated.message
          });

          ui.log(`${file.name}: ${translated.message}`);
        } catch (error) {
          ui.renderResult({
            ok: false,
            name: file.name,
            message: error.message || 'Error desconocido'
          });

          ui.log(`${file.name}: ERROR - ${error.message}`);
        }

        ui.setProgress(i + 1, total, `Traducidos ${i + 1} de ${total}`);
      }

      const info = downloadsCore.getBatchSizeInfo(state.batchResults);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      if (state.batchResults.length > 0) {
        ui.log(`Traducción completada. Resultados válidos: ${info.count}. Tamaño total descargable: ${window.MultiTraceUtils.formatBytes(info.totalBytes)}.`);
      } else {
        ui.log('Traducción completada sin resultados descargables.');
      }

      ui.log(`Traducción completada en ${elapsed} segundos.`);
    } finally {
      translatorState.translating = false;
      translatorState.currentFileIndex = 0;
      updateUiState();
    }
  }

  // Event Listeners
  ui.dom.dropzone.addEventListener('click', () => {
    if (!translatorState.translating) ui.dom.fileInput.click();
  });

  ui.dom.selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!translatorState.translating) ui.dom.fileInput.click();
  });

  ui.dom.fileInput.addEventListener('change', (e) => setFiles(e.target.files));

  ui.dom.dropzone.addEventListener('dragover', (e) => {
    if (translatorState.translating) return;
    e.preventDefault();
    ui.dom.dropzone.classList.add('dragover');
  });

  ui.dom.dropzone.addEventListener('dragleave', () => ui.dom.dropzone.classList.remove('dragover'));

  ui.dom.dropzone.addEventListener('drop', (e) => {
    if (translatorState.translating) return;
    e.preventDefault();
    ui.dom.dropzone.classList.remove('dragover');
    setFiles(e.dataTransfer.files);
  });

  ui.dom.clearBtn.addEventListener('click', () => {
    if (translatorState.translating) return;
    state.files = [];
    ui.dom.fileInput.value = '';
    state.downloads.clear();
    state.batchResults.length = 0;
    dom.fileProgress.innerHTML = '';
    ui.renderFiles();
    ui.clearResults();
    ui.clearLog();
    updateUiState();
  });

  ui.dom.results.addEventListener('click', (e) => {
    const button = e.target.closest('[data-download]');
    if (!button || translatorState.translating) return;
    const item = state.downloads.get(button.dataset.download);
    if (!item) return;
    downloadsCore.downloadBlob(item.blob, item.filename);
  });

  ui.dom.downloadAllBtn.addEventListener('click', async () => {
    if (translatorState.translating) return;

    try {
      const config = window.MultiTraceConfig;
      const utils = window.MultiTraceUtils;
      const info = downloadsCore.getBatchSizeInfo(state.batchResults);
      
      if (info.count > config.maxBundleFiles || info.totalBytes > config.maxBundleSize) {
        ui.log(`Lote demasiado grande para descarga agrupada: ${info.count} archivos, ${utils.formatBytes(info.totalBytes)}.`);
        alert(
          `El lote es demasiado grande para generar un ZIP combinado.\n\n` +
          `Archivos: ${info.count}\n` +
          `Tamaño total: ${utils.formatBytes(info.totalBytes)}\n\n` +
          `Usa la descarga individual o divide el lote.`
        );
        return;
      }

      ui.log(`Generando ZIP con traducciones (${info.count} archivos, ${utils.formatBytes(info.totalBytes)})...`);
      ui.dom.downloadAllBtn.disabled = true;
      ui.dom.downloadEachBtn.disabled = true;
      await downloadsCore.downloadAllResults(state.batchResults, ui.dom.logBox.textContent);
      ui.log('Se ha generado el ZIP con las traducciones.');
    } catch (error) {
      ui.log(`Error al generar ZIP: ${error.message}`);
    } finally {
      updateUiState();
    }
  });

  ui.dom.downloadEachBtn.addEventListener('click', async () => {
    if (translatorState.translating) return;

    try {
      if (!state.batchResults.length) {
        ui.log('No hay archivos para descargar.');
        return;
      }

      ui.dom.downloadAllBtn.disabled = true;
      ui.dom.downloadEachBtn.disabled = true;
      ui.log(`Lanzando descarga individual de ${state.batchResults.length} archivos...`);
      await downloadsCore.downloadSequentially(state.batchResults);
      ui.log('Descarga individual completada.');
    } catch (error) {
      ui.log(`Error en descarga individual: ${error.message}`);
    } finally {
      updateUiState();
    }
  });

  dom.translateBtn.addEventListener('click', processTranslationBatch);

  // Inicialización
  populateLanguageSelectors();
  initializeService();
  ui.renderFiles();
  ui.clearResults();
  updateUiState();

  console.log('[TRANSLATOR-APP] Aplicación de traducción inicializada');
})();
