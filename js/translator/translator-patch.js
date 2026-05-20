(function () {
  const config = window.MultiTraceConfig;

  const PATCH_START = `<!-- ${config.patchSignaturePrefix} TRANSLATION v${config.patchVersion} START -->`;
  const PATCH_END = `<!-- ${config.patchSignaturePrefix} TRANSLATION v${config.patchVersion} END -->`;

  // Marcador para detectar traducción previa
  const TRANSLATION_MARKER_REGEX = /<!--\s*MAINJOBS\s+TRANSLATION(?:\s+v[\d.]+)?\s+START\s*-->/i;

  // Construir metadatos de traducción
  function buildTranslationMetadata(sourceLang, targetLang, timestamp) {
    return `
${PATCH_START}
<!-- Source Language: ${sourceLang} -->
<!-- Target Language: ${targetLang} -->
<!-- Translation Date: ${new Date(timestamp).toISOString()} -->
<!-- Service: Auto-detected -->
${PATCH_END}`.trim();
  }

  // Verificar si el HTML ya tiene traducción
  function hasExistingTranslation(html) {
    return TRANSLATION_MARKER_REGEX.test(html);
  }

  // Eliminar traducción existente
  function removeExistingTranslation(html) {
    const regex = new RegExp(
      `${PATCH_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/START/g, 'START[\\s\\S]*?END')}`,
      'i'
    );
    return html.replace(regex, '');
  }

  // Inyectar metadatos de traducción en el HTML
  function injectTranslationMetadata(html, metadata) {
    // Intentar inyectar después del opening <html> tag
    const htmlTagRegex = /<html[^>]*>/i;
    if (htmlTagRegex.test(html)) {
      return html.replace(htmlTagRegex, `$&\n${metadata}`);
    }

    // Fallback: inyectar al principio
    return metadata + '\n' + html;
  }

  window.MultiTraceTranslatorPatch = {
    buildTranslationMetadata,
    hasExistingTranslation,
    removeExistingTranslation,
    injectTranslationMetadata
  };

  console.log('[SCORM-TRANSLATOR-PATCH] Módulo de parche de traducción cargado');
})();
