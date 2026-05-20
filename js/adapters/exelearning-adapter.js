(function () {
  const utils = window.MultiTraceUtils;
  const detector = window.MultiTraceExeLearningDetector;
  const patcher = window.MultiTraceExeLearningPatch;

  async function inspect(zip) {
    const indexPath = detector.findPreferredIndex(zip);
    const pkgInfo = await detector.detect(zip, indexPath);
    return {
      indexPath,
      hasScormManifest: pkgInfo.hasScormManifest,
      looksLikeExe: pkgInfo.looksLikeExe,
      type: pkgInfo.type
    };
  }

  async function matches(zip, context) {
    const info = await inspect(zip);
    if (context && context.strictMode) {
      return info.hasScormManifest && info.looksLikeExe;
    }
    return info.looksLikeExe;
  }

  async function process(zip, file, options) {
    if (!detector) throw new Error("No se ha cargado el detector de eXeLearning.");
    if (!patcher) throw new Error("No se ha cargado el parche de eXeLearning.");

    const pkgInfo = await inspect(zip);
    detector.validate(pkgInfo);

    if (!pkgInfo.indexPath) {
      throw new Error("No se ha encontrado index.html en el paquete.");
    }

    const entry = zip.file(pkgInfo.indexPath);
    if (!entry) throw new Error("No se ha podido abrir index.html.");

    let html = await entry.async("string");
    const alreadyPatched = patcher.hasExistingPatch(html);

    if (alreadyPatched && !options.force) {
      return {
        blob: null,
        outputName: null,
        message: "El paquete ya estaba trazado. No se ha modificado.",
        already: true,
        downloadable: false,
        packageType: "exelearning",
        systemLabel: "eXeLearning"
      };
    }

    if (alreadyPatched && options.force) {
      html = patcher.removeExistingPatch(html);
    }

    const patch = patcher.buildPatch(options.debug);
    const injectedHtml = patcher.injectIntoHtml(html, patch);
    if (!injectedHtml) throw new Error("No se ha encontrado punto de inyección en index.html.");

    zip.file(pkgInfo.indexPath, injectedHtml);
    const outputBlob = await zip.generateAsync({ type: "blob" });

    return {
      blob: outputBlob,
      outputName: utils.buildOutputName(file.name),
      message: alreadyPatched
        ? `Traza eXeLearning reinyectada en ${pkgInfo.indexPath}`
        : `Traza eXeLearning insertada en ${pkgInfo.indexPath}`,
      already: false,
      downloadable: true,
      packageType: "exelearning",
      systemLabel: "eXeLearning"
    };
  }

  window.MultiTraceExeLearningAdapter = {
    id: "exelearning",
    label: "eXeLearning",
    matches,
    process
  };
})();