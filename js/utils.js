window.MultiTraceUtils = {
  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  normalizeSystemName(value) {
    return String(value || "unknown").trim().toLowerCase();
  },

  buildOutputName(originalName, suffix = "_traza") {
    if (/\.zip$/i.test(originalName)) {
      return originalName.replace(/\.zip$/i, `${suffix}.zip`);
    }
    return `${originalName}${suffix}.zip`;
  }
};
