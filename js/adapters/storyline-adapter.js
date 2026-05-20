(function () {
  const utils = window.MultiTraceUtils;
  const detector = window.MultiTraceStorylineDetector;
  const patcher = window.MultiTraceStorylinePatch;

  function listZipFiles(zip) {
    return Object.keys(zip.files);
  }

  function findPreferredEntry(zip) {
    if (detector && typeof detector.findPreferredEntry === "function") {
      return detector.findPreferredEntry(zip);
    }

    const paths = listZipFiles(zip).filter(path => /story\.html$/i.test(path));
    const priorities = [
      /(^|\/)story\.html$/i,
      /(^|\/)html5\/story\.html$/i
    ];

    for (const pattern of priorities) {
      const match = paths.find(path => pattern.test(path));
      if (match) return match;
    }

    return paths[0] || null;
  }

  async function inspect(zip) {
    if (detector && typeof detector.detect === "function") {
      const entryPath = findPreferredEntry(zip);
      const info = await detector.detect(zip, entryPath);

      return {
        entryPath,
        hasScormManifest: !!info.hasManifest,
        looksLikeStoryline: !!info.looksLikeStoryline,
        type: info.type || "storyline"
      };
    }

    const fileNames = listZipFiles(zip);
    const entryPath = findPreferredEntry(zip);

    const hasScormManifest = fileNames.some(name => /(^|\/)imsmanifest\.xml$/i.test(name));
    const hasStoryHtml = fileNames.some(name => /(^|\/)story\.html$/i.test(name));
    const hasStoryContent = fileNames.some(name => /(^|\/)story_content\//i.test(name));
    const hasUserJs = fileNames.some(name => /(^|\/)user\.js$/i.test(name));

    const looksLikeStoryline = hasStoryHtml && (hasStoryContent || hasUserJs);

    return {
      entryPath,
      hasScormManifest,
      looksLikeStoryline,
      type: looksLikeStoryline ? "storyline" : "unknown"
    };
  }

  async function matches(zip, context) {
    const info = await inspect(zip);

    if (context && context.strictMode) {
      return info.hasScormManifest && info.looksLikeStoryline;
    }

    return info.looksLikeStoryline;
  }

  async function process(zip, file, options) {
    if (!patcher) {
      throw new Error("No se ha cargado el parche de Storyline.");
    }

    const pkgInfo = await inspect(zip);

    if (!pkgInfo.hasScormManifest) {
      throw new Error("El ZIP no parece un paquete SCORM válido: falta imsmanifest.xml.");
    }

    if (!pkgInfo.looksLikeStoryline) {
      throw new Error("El paquete no parece un export de Storyline compatible con esta herramienta.");
    }

    if (!pkgInfo.entryPath) {
      throw new Error("No se ha encontrado story.html en el paquete.");
    }

    const entry = zip.file(pkgInfo.entryPath);
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
        packageType: "storyline"
      };
    }

    if (alreadyPatched && options.force) {
      html = patcher.removeExistingPatch(html);
    }

    const injectedHtml = patcher.injectIntoHtml(html);
    if (!injectedHtml) {
      throw new Error("No se ha encontrado un punto de inyección válido en story.html.");
    }

    zip.file(pkgInfo.entryPath, injectedHtml);
    zip.file(patcher.patchFilePath, patcher.buildPatch(options.debug));

    const outputBlob = await zip.generateAsync({ type: "blob" });

    return {
      blob: outputBlob,
      outputName: utils.buildOutputName(file.name),
      message: alreadyPatched
        ? `Traza Storyline reinyectada en ${pkgInfo.entryPath}`
        : `Traza Storyline insertada en ${pkgInfo.entryPath}`,
      already: false,
      downloadable: true,
      packageType: "storyline"
    };
  }

  window.MultiTraceStorylineAdapter = {
    id: "storyline",
    label: "Storyline 360",
    matches,
    process
  };
})();