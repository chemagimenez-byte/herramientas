(function () {
  function listZipFiles(zip) {
    return Object.keys(zip.files);
  }

  function findPreferredIndex(zip) {
    const paths = listZipFiles(zip).filter(path => /index\.html$/i.test(path));

    const priorities = [
      /(^|\/)scormcontent\/index\.html$/i,
      /(^|\/)index\.html$/i
    ];

    for (const pattern of priorities) {
      const match = paths.find(path => pattern.test(path));
      if (match) return match;
    }

    return paths[0] || null;
  }

  async function detect(zip, indexPath) {
    const fileNames = listZipFiles(zip);

    const hasScormManifest = fileNames.some(name => /(^|\/)imsmanifest\.xml$/i.test(name));
    const hasRiseAssets = fileNames.some(name => /(^|\/)(lib\/rise|rise)\//i.test(name));

    let indexHtml = "";
    if (indexPath && zip.file(indexPath)) {
      indexHtml = await zip.file(indexPath).async("string");
    }

    const looksLikeRise =
      hasRiseAssets ||
      /getLMSData|Runtime\.getProgress|LMSProxy|Articulate/i.test(indexHtml);

    return {
      hasScormManifest,
      looksLikeRise,
      type: looksLikeRise ? "rise" : "unknown"
    };
  }

  function validate(pkgInfo) {
    if (!pkgInfo.hasScormManifest) {
      throw new Error("El ZIP no parece un paquete SCORM válido: falta imsmanifest.xml.");
    }

    if (!pkgInfo.looksLikeRise) {
      throw new Error("El paquete no parece un export de Rise compatible con esta herramienta.");
    }
  }

  window.MultiTraceRiseDetector = {
    listZipFiles,
    findPreferredIndex,
    detect,
    validate
  };
})();