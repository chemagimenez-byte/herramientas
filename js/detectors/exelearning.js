(function () {
  function listZipFiles(zip) {
    return Object.keys(zip.files);
  }

  function findPreferredIndex(zip) {
    const paths = listZipFiles(zip).filter(path => /index\.html$/i.test(path));
    const priorities = [
      /(^|\/)index\.html$/i,
      /(^|\/)content\.html$/i,
      /(^|\/)common\.html$/i
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
    const hasExeJs = fileNames.some(name => /(^|\/)eXeSCORM\.js$/i.test(name));
    const hasExeFolder = fileNames.some(name => /(^|\/)exe(Content)?\//i.test(name));

    let indexHtml = "";
    if (indexPath && zip.file(indexPath)) {
      indexHtml = await zip.file(indexPath).async("string");
    }

    const looksLikeExe = hasExeJs || hasExeFolder ||
      /eXeLearning|eXeSCORM|ExeContent|\.iDevice/i.test(indexHtml);

    return {
      hasScormManifest,
      looksLikeExe,
      type: looksLikeExe ? "exelearning" : "unknown"
    };
  }

  function validate(pkgInfo) {
    if (!pkgInfo.hasScormManifest) {
      throw new Error("El ZIP no parece un paquete SCORM válido: falta imsmanifest.xml.");
    }
    if (!pkgInfo.looksLikeExe) {
      throw new Error("El paquete no parece un export de eXeLearning compatible.");
    }
  }

  window.MultiTraceExeLearningDetector = {
    findPreferredIndex,
    detect,
    validate
  };
})();