(function () {
  function listZipFiles(zip) {
    return Object.keys(zip.files);
  }

  function findPreferredEntry(zip) {
    const paths = listZipFiles(zip).filter(path =>
      /(index_lms\.html|story\.html)$/i.test(path)
    );

    const priorities = [
      /(^|\/)index_lms\.html$/i,
      /(^|\/)story\.html$/i,
      /(^|\/)html5\/story\.html$/i
    ];

    for (const pattern of priorities) {
      const match = paths.find(path => pattern.test(path));
      if (match) return match;
    }

    return paths[0] || null;
  }

  async function detect(zip, entryPath) {
    const fileNames = listZipFiles(zip);

    const hasManifest = fileNames.some(name => /(^|\/)imsmanifest\.xml$/i.test(name));
    const hasIndexLms = fileNames.some(name => /(^|\/)index_lms\.html$/i.test(name));
    const hasStoryHtml = fileNames.some(name => /(^|\/)story\.html$/i.test(name));
    const hasStoryContent = fileNames.some(name => /(^|\/)story_content\//i.test(name));
    const hasUserJs = fileNames.some(name => /(^|\/)user\.js$/i.test(name));

    let entryHtml = "";
    if (entryPath && zip.file(entryPath)) {
      entryHtml = await zip.file(entryPath).async("string");
    }

    let score = 0;
    if (hasIndexLms) score += 40;
    if (hasStoryHtml) score += 30;
    if (hasStoryContent) score += 20;
    if (hasUserJs) score += 10;

    if (/GetPlayer|story_content|bootstrapper|Articulate|slides\.min|frame\.desktop/i.test(entryHtml)) {
      score += 15;
    }

    return {
      hasManifest,
      hasIndexLms,
      hasStoryHtml,
      hasStoryContent,
      hasUserJs,
      score,
      looksLikeStoryline: score >= 60,
      type: score >= 60 ? "storyline" : "unknown",
      entryPath
    };
  }

  function validate(pkgInfo) {
    if (!pkgInfo.hasManifest) {
      throw new Error("El ZIP no parece un paquete SCORM válido: falta imsmanifest.xml.");
    }

    if (!pkgInfo.looksLikeStoryline) {
      throw new Error("El paquete no parece un export de Storyline compatible con esta herramienta.");
    }

    if (!pkgInfo.entryPath) {
      throw new Error("No se ha encontrado un archivo de entrada compatible para Storyline.");
    }
  }

  window.MultiTraceStorylineDetector = {
    listZipFiles,
    findPreferredEntry,
    detect,
    validate
  };
})();