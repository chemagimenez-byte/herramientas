(function () {
  const config = window.MultiTraceConfig;
  const utils = window.MultiTraceUtils;
  const ui = window.MultiTraceUI;

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getBatchSizeInfo(resultsList) {
    let totalBytes = 0;
    for (const item of resultsList) totalBytes += item.blob.size || 0;
    return { count: resultsList.length, totalBytes };
  }

  async function downloadAllResults(resultsList, logText) {
    if (!resultsList.length) {
      throw new Error("No hay resultados para agrupar.");
    }

    const bundle = new JSZip();
    for (const item of resultsList) {
      bundle.file(item.outputName, item.blob);
    }

    bundle.file("log.txt", logText || "");
    const blob = await bundle.generateAsync({ type: "blob" });
    downloadBlob(blob, "trazabilidad.zip");
  }

  async function downloadSequentially(resultsList) {
    for (const item of resultsList) {
      downloadBlob(item.blob, item.outputName);
      ui.log(`Descarga lanzada: ${item.outputName}`);
      await utils.sleep(config.sequentialDownloadDelay);
    }
  }

  window.MultiTraceDownloads = {
    downloadBlob,
    getBatchSizeInfo,
    downloadAllResults,
    downloadSequentially
  };
})();
