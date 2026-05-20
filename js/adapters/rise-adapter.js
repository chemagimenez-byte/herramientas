(function () {
  const utils = window.MultiTraceUtils;

  function listZipFiles(zip) {
    return Object.keys(zip.files);
  }

  function findPreferredIndex(zip) {
    const paths = listZipFiles(zip).filter(path => /index\.html$/i.test(path));
    const priorities = [/(^|\/)scormcontent\/index\.html$/i, /(^|\/)index\.html$/i];

    for (const pattern of priorities) {
      const match = paths.find(path => pattern.test(path));
      if (match) return match;
    }

    return paths[0] || null;
  }

  async function inspect(zip) {
    const fileNames = listZipFiles(zip);
    const indexPath = findPreferredIndex(zip);
    const hasScormManifest = fileNames.some(name => /(^|\/)imsmanifest\.xml$/i.test(name));
    const hasRiseAssets = fileNames.some(name => /(^|\/)(lib\/rise|rise)\//i.test(name));

    let indexHtml = "";
    if (indexPath && zip.file(indexPath)) {
      indexHtml = await zip.file(indexPath).async("string");
    }

    const looksLikeRise = hasRiseAssets || /getLMSData|Runtime\.getProgress|LMSProxy|Articulate/i.test(indexHtml);

    return {
      indexPath,
      hasScormManifest,
      looksLikeRise,
      type: looksLikeRise ? "rise" : "unknown",
      indexHtml
    };
  }

  async function matches(zip, context) {
    const info = await inspect(zip);
    if (context.strictMode) return info.hasScormManifest && info.looksLikeRise;
    return info.looksLikeRise;
  }

  async function process(zip, file, options) {

	console.log("[DEBUG] rise-adapter process()", {
	  patcher: window.MultiTraceRisePatch,
	  fileName: file && file.name,
	  options: options
	});	  

    const patcher = window.MultiTraceRisePatch;
    const pkgInfo = await inspect(zip);

    if (!pkgInfo.hasScormManifest) {
      throw new Error("El ZIP no parece un paquete SCORM válido: falta imsmanifest.xml.");
    }

    if (!pkgInfo.looksLikeRise) {
      throw new Error("El paquete no parece un export de Rise compatible con esta herramienta.");
    }

    if (!pkgInfo.indexPath) {
      throw new Error("No se ha encontrado index.html en el paquete.");
    }

    let html = pkgInfo.indexHtml;
    const alreadyPatched = patcher.hasExistingPatch(html);

    if (alreadyPatched && !options.force) {
      return {
        blob: null,
        outputName: null,
        message: "El paquete ya estaba trazado. No se ha modificado.",
        already: true,
        downloadable: false
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

    zip.file(pkgInfo.indexPath, injectedHtml);
    const outputBlob = await zip.generateAsync({ type: "blob" });

    return {
      blob: outputBlob,
      outputName: utils.buildOutputName(file.name),
      message: alreadyPatched ? `Traza reinyectada en ${pkgInfo.indexPath}` : `Traza insertada en ${pkgInfo.indexPath}`,
      already: false,
      downloadable: true
    };
  }

  window.MultiTraceRiseAdapter = {
    id: "rise",
    label: "Rise / Moodle",
    matches,
    process
  };
})();
