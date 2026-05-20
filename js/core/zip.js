(function () {
  function buildOutputName(originalName) {
    if (/\.zip$/i.test(originalName)) {
      return originalName.replace(/\.zip$/i, "_traza.zip");
    }
    return `${originalName}_traza.zip`;
  }

  async function processRiseZip(file, options) {
    console.log("[DEBUG] zip.js processRiseZip()");

    const zip = await JSZip.loadAsync(file);
    const detector = window.MultiTraceRiseDetector;
    const patcher = window.MultiTraceRisePatch;

    if (!detector) {
      throw new Error("No se ha cargado el detector de Rise.");
    }

    if (!patcher) {
      throw new Error("No se ha cargado el parche de Rise.");
    }

    const indexPath = detector.findPreferredIndex(zip);
    if (!indexPath) {
      throw new Error("No se ha encontrado index.html en el paquete.");
    }

    const pkgInfo = await detector.detect(zip, indexPath);
    detector.validate(pkgInfo);

    const zipEntry = zip.file(indexPath);
    if (!zipEntry) {
      throw new Error("No se ha podido abrir index.html.");
    }

    let html = await zipEntry.async("string");
    const alreadyPatched = patcher.hasExistingPatch(html);

    if (alreadyPatched && !options.force) {
      return {
        blob: null,
        outputName: null,
        message: "El paquete ya estaba trazado. No se ha modificado.",
        already: true,
        downloadable: false,
        packageType: pkgInfo.type,
        systemLabel: "Rise / Moodle"
      };
    }

    if (alreadyPatched && options.force) {
      html = patcher.removeExistingPatch(html);
    }

    const patch = patcher.buildPatch(options.debug);
    const injectedHtml = patcher.injectIntoHtml(html, patch);

    if (!injectedHtml) {
      throw new Error("No se ha encontrado un punto de inyección válido.");
    }

    zip.file(indexPath, injectedHtml);

    const outputBlob = await zip.generateAsync({ type: "blob" });

    return {
      blob: outputBlob,
      outputName: buildOutputName(file.name),
      message: alreadyPatched
        ? `Traza reinyectada en ${indexPath}`
        : `Trazado inyectado en ${indexPath}`,
      already: false,
      downloadable: true,
      packageType: pkgInfo.type,
      systemLabel: "Rise / Moodle"
    };
  }

  async function processStorylineZip(file, options) {
    const zip = await JSZip.loadAsync(file);
    const detector = window.MultiTraceStorylineDetector;
    const patcher = window.MultiTraceStorylinePatch;

    if (!detector) {
      throw new Error("No se ha cargado el detector de Storyline.");
    }

    if (!patcher) {
      throw new Error("No se ha cargado el parche de Storyline.");
    }

    const entryPath = detector.findPreferredEntry(zip);
    if (!entryPath) {
      throw new Error("No se ha encontrado story.html en el paquete.");
    }

    const pkgInfo = await detector.detect(zip, entryPath);
    detector.validate(pkgInfo);

    const entry = zip.file(entryPath);
    if (!entry) {
      throw new Error("No se ha podido abrir story.html.");
    }

    let html = await entry.async("string");
    const alreadyPatched = patcher.hasExistingPatch(html);

    if (alreadyPatched && !options.force) {
      return {
        blob: null,
        outputName: null,
        message: "El paquete ya estaba trazado. No se ha modificado.",
        already: true,
        downloadable: false,
        packageType: pkgInfo.type,
        systemLabel: "Storyline 360"
      };
    }

    if (alreadyPatched && options.force) {
      html = patcher.removeExistingPatch(html);
    }

    const injectedHtml = patcher.injectIntoHtml(html);
    if (!injectedHtml) {
      throw new Error("No se ha encontrado un punto de inyección válido en story.html.");
    }

    zip.file(entryPath, injectedHtml);
    zip.file(patcher.patchFilePath, patcher.buildPatch(options.debug));

    const outputBlob = await zip.generateAsync({ type: "blob" });

    return {
      blob: outputBlob,
      outputName: buildOutputName(file.name),
      message: alreadyPatched
        ? `Traza Storyline reinyectada en ${entryPath}`
        : `Traza Storyline inyectada en ${entryPath}`,
      already: false,
      downloadable: true,
      packageType: pkgInfo.type,
      systemLabel: "Storyline 360"
    };
  }

  // NUEVA FUNCIÓN para eXeLearning
async function processExeLearningZip(file, options) {
  const zip = await JSZip.loadAsync(file);
  const detector = window.MultiTraceExeLearningDetector;
  const patcher = window.MultiTraceExeLearningPatch;

  if (!detector) throw new Error("No se ha cargado el detector de eXeLearning.");
  if (!patcher) throw new Error("No se ha cargado el parche de eXeLearning.");

  // Leer imsmanifest.xml para obtener todas las páginas HTML
  let manifestFile = zip.file("imsmanifest.xml");
  if (!manifestFile) throw new Error("No se encuentra imsmanifest.xml");

  let manifestXml = await manifestFile.async("string");
  let parser = new DOMParser();
  let xmlDoc = parser.parseFromString(manifestXml, "application/xml");

  // Obtener recursos de tipo webcontent que tengan href .html
  let resources = xmlDoc.querySelectorAll("resource[type='webcontent']");
  let htmlFiles = [];
  for (let res of resources) {
    let href = res.getAttribute("href");
    if (href && href.match(/\.html?$/i)) {
      htmlFiles.push(href);
    }
  }
  // Fallback: buscar todos los .html en el ZIP
  if (htmlFiles.length === 0) {
    htmlFiles = Object.keys(zip.files).filter(name => name.match(/\.html?$/i) && !name.includes("/_"));
  }

  const totalPages = htmlFiles.length;
  if (totalPages === 0) throw new Error("No se encontraron archivos HTML en el paquete.");

  // Procesar cada archivo HTML inyectando el mismo script (pero con su ID)
  for (let htmlPath of htmlFiles) {
    let entry = zip.file(htmlPath);
    if (!entry) continue;

    let html = await entry.async("string");
    let alreadyPatched = patcher.hasExistingPatch(html);

    if (alreadyPatched && !options.force) {
      continue; // Saltar si ya tiene parche y no se fuerza
    }

    if (alreadyPatched && options.force) {
      html = patcher.removeExistingPatch(html);
    }

    // Construir parche con totalPages y el identificador de esta página (su ruta)
    const patch = patcher.buildPatch(options.debug, totalPages, htmlPath);
    const injectedHtml = patcher.injectIntoHtml(html, patch);
    if (!injectedHtml) {
      console.warn(`No se pudo inyectar en ${htmlPath}, se omite.`);
      continue;
    }

    zip.file(htmlPath, injectedHtml);
  }

  const outputBlob = await zip.generateAsync({ type: "blob" });

  return {
    blob: outputBlob,
    outputName: buildOutputName(file.name),
    message: `Traza eXeLearning inyectada en ${totalPages} páginas (seguimiento por páginas únicas visitadas).`,
    already: false,
    downloadable: true,
    packageType: "exelearning",
    systemLabel: "eXeLearning"
  };
}

  async function detectPackageType(zip) {
    const riseDetector = window.MultiTraceRiseDetector;
    const storylineDetector = window.MultiTraceStorylineDetector;
    const exeDetector = window.MultiTraceExeLearningDetector;

    if (riseDetector) {
      const riseIndex = riseDetector.findPreferredIndex(zip);
      if (riseIndex) {
        const riseInfo = await riseDetector.detect(zip, riseIndex);
        if (riseInfo.looksLikeRise) {
          return { type: "rise" };
        }
      }
    }

    if (storylineDetector) {
      const storyEntry = storylineDetector.findPreferredEntry(zip);
      if (storyEntry) {
        const storyInfo = await storylineDetector.detect(zip, storyEntry);
        if (storyInfo.looksLikeStoryline) {
          return { type: "storyline" };
        }
      }
    }

    if (exeDetector) {
      const exeIndex = exeDetector.findPreferredIndex(zip);
      if (exeIndex) {
        const exeInfo = await exeDetector.detect(zip, exeIndex);
        if (exeInfo.looksLikeExe) {
          return { type: "exelearning" };
        }
      }
    }

    return { type: "unknown" };
  }

  async function processZip(file, options) {
    console.log("[DEBUG] zip.js processZip()");

    const zip = await JSZip.loadAsync(file);
    const detected = await detectPackageType(zip);

    if (detected.type === "rise") {
      return processRiseZip(file, options);
    }
    if (detected.type === "storyline") {
      return processStorylineZip(file, options);
    }
    if (detected.type === "exelearning") {
      return processExeLearningZip(file, options);
    }

    throw new Error("El paquete no corresponde a un formato compatible todavía.");
  }

  window.MultiTraceZip = {
    buildOutputName,
    processRiseZip,
    processStorylineZip,
    processExeLearningZip,   // exportamos la nueva función
    processZip
  };
})();