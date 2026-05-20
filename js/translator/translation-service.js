(function () {
  // Configuración de idiomas soportados
  const SUPPORTED_LANGUAGES = [
    { code: 'es', name: 'Español', regional: false },
    { code: 'ca', name: 'Catalán', regional: true },
    { code: 'eu', name: 'Euskera', regional: true },
    { code: 'gl', name: 'Gallego', regional: true },
    { code: 'en', name: 'Inglés', regional: false },
    { code: 'fr', name: 'Francés', regional: false },
    { code: 'de', name: 'Alemán', regional: false },
    { code: 'pt', name: 'Portugués', regional: false },
    { code: 'it', name: 'Italiano', regional: false },
    { code: 'nl', name: 'Neerlandés', regional: false },
    { code: 'pl', name: 'Polaco', regional: false },
    { code: 'ru', name: 'Ruso', regional: false },
    { code: 'zh', name: 'Chino', regional: false },
    { code: 'ja', name: 'Japonés', regional: false },
    { code: 'ko', name: 'Coreano', regional: false },
    { code: 'ar', name: 'Árabe', regional: false }
  ];

  // Servicios de traducción gratuitos disponibles
  const TRANSLATION_SERVICES = {
    LIBRETRANSLATE: {
      name: 'LibreTranslate',
      endpoints: [
        'https://libretranslate.com/translate',
        'https://translate.astian.org/translate',
        'https://lt.rashev.org/translate'
      ],
      method: 'POST',
      payloadFormat: (text, source, target) => ({
        q: text,
        source: source === 'auto' ? 'auto' : source,
        target: target,
        format: 'html'
      }),
      responseParser: (data) => data.translatedText || data.translation
    },
    MYMEMORY: {
      name: 'MyMemory',
      endpoints: [
        'https://api.mymemory.translated.net/get'
      ],
      method: 'GET',
      payloadFormat: (text, source, target) => null,
      urlBuilder: (endpoint, text, source, target) => {
        const q = encodeURIComponent(text);
        const langpair = `${source}|${target}`;
        return `${endpoint}?q=${q}&langpair=${langpair}`;
      },
      responseParser: (data) => data.responseData.translatedText
    }
  };

  // Mapeo de códigos de idioma para diferentes servicios
  const LANGUAGE_MAPPINGS = {
    LIBRETRANSLATE: {
      'auto': 'auto',
      'es': 'es',
      'ca': 'ca',
      'eu': 'eu',
      'gl': 'gl',
      'en': 'en',
      'fr': 'fr',
      'de': 'de',
      'pt': 'pt',
      'it': 'it',
      'nl': 'nl',
      'pl': 'pl',
      'ru': 'ru',
      'zh': 'zh',
      'ja': 'ja',
      'ko': 'ko',
      'ar': 'ar'
    },
    MYMEMORY: {
      'auto': 'autodetect',
      'es': 'es',
      'ca': 'ca',
      'eu': 'eu',
      'gl': 'gl',
      'en': 'en',
      'fr': 'fr',
      'de': 'de',
      'pt': 'pt',
      'it': 'it',
      'nl': 'nl',
      'pl': 'pl',
      'ru': 'ru',
      'zh': 'zh',
      'ja': 'ja',
      'ko': 'ko',
      'ar': 'ar'
    }
  };

  let currentService = null;
  let availableEndpoints = [];

  // Detectar servicio disponible
  async function detectAvailableService() {
    for (const [serviceName, service] of Object.entries(TRANSLATION_SERVICES)) {
      for (const endpoint of service.endpoints) {
        try {
          const testText = 'hello';
          const result = await translateWithService(serviceName, endpoint, testText, 'en', 'es', 5000);
          if (result && result.length > 0) {
            currentService = serviceName;
            availableEndpoints = [endpoint];
            console.log(`[SCORM-TRANSLATOR] Servicio detectado: ${service.name} en ${endpoint}`);
            return true;
          }
        } catch (error) {
          console.warn(`[SCORM-TRANSLATOR] Endpoint ${endpoint} no disponible:`, error.message);
        }
      }
    }
    return false;
  }

  // Traducir con un servicio específico
  async function translateWithService(serviceName, endpoint, text, source, target, timeout = 10000) {
    const service = TRANSLATION_SERVICES[serviceName];
    if (!service) throw new Error(`Servicio ${serviceName} no encontrado`);

    const sourceCode = LANGUAGE_MAPPINGS[serviceName][source] || source;
    const targetCode = LANGUAGE_MAPPINGS[serviceName][target] || target;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let url = endpoint;
      let options = {
        method: service.method,
        signal: controller.signal,
        headers: {}
      };

      if (service.method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        const payload = service.payloadFormat(text, sourceCode, targetCode);
        options.body = JSON.stringify(payload);
      } else if (service.method === 'GET' && service.urlBuilder) {
        url = service.urlBuilder(endpoint, text, sourceCode, targetCode);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return service.responseParser(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Timeout en la traducción');
      }
      throw error;
    }
  }

  // Función principal de traducción con reintentos
  async function translateText(text, source = 'auto', target = 'en', maxRetries = 3) {
    if (!text || text.trim().length === 0) return text;

    // Si no hay servicio detectado, intentar detectar
    if (!currentService) {
      const detected = await detectAvailableService();
      if (!detected) {
        throw new Error('No se pudo conectar con ningún servicio de traducción gratuito');
      }
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const endpoint = availableEndpoints[0];
        const result = await translateWithService(currentService, endpoint, text, source, target);
        return result || text;
      } catch (error) {
        lastError = error;
        console.warn(`[SCORM-TRANSLATOR] Intento ${attempt} fallido:`, error.message);
        
        // Si falla, intentar con otro servicio
        if (attempt < maxRetries) {
          currentService = null;
          const detected = await detectAvailableService();
          if (!detected) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    }

    throw lastError || new Error('Traducción fallida después de múltiples intentos');
  }

  // Extraer texto traducible de HTML
  function extractTranslatableContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const translatableElements = [];
    const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span, div, td, th, label, button, a');
    
    elements.forEach((el, index) => {
      const text = el.textContent.trim();
      if (text && text.length > 2 && !el.closest('script, style, noscript')) {
        // Evitar elementos muy cortos o que parezcan código
        if (!/^[a-zA-Z0-9\-_./\\]+$/.test(text)) {
          translatableElements.push({
            id: index,
            tagName: el.tagName,
            text: text,
            hasHtml: el.innerHTML !== el.outerHTML
          });
        }
      }
    });

    return { doc, translatableElements };
  }

  // Reconstruir HTML con contenido traducido
  function rebuildHtml(doc, translations) {
    Object.keys(translations).forEach(id => {
      const element = doc.querySelector(`[data-translate-id="${id}"]`);
      if (element) {
        // Preservar formato HTML interno si existe
        element.textContent = translations[id];
      }
    });
    return doc.documentElement.outerHTML;
  }

  // Traducir contenido HTML completo
  async function translateHtml(html, source = 'auto', target = 'en', onProgress = null) {
    const { doc, translatableElements } = extractTranslatableContent(html);
    
    if (translatableElements.length === 0) {
      return html;
    }

    const translations = {};
    const total = translatableElements.length;

    // Añadir marcadores para identificar elementos
    translatableElements.forEach((item, index) => {
      const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span, div, td, th, label, button, a');
      let count = 0;
      for (let el of elements) {
        if (el.textContent.trim() === item.text && !el.closest('script, style, noscript')) {
          if (count === index) {
            el.setAttribute('data-translate-id', item.id);
            break;
          }
          count++;
        }
      }
    });

    // Traducir en lotes para evitar rate limiting
    const batchSize = 5;
    for (let i = 0; i < translatableElements.length; i += batchSize) {
      const batch = translatableElements.slice(i, i + batchSize);
      
      const promises = batch.map(async (item) => {
        try {
          const translated = await translateText(item.text, source, target);
          translations[item.id] = translated;
        } catch (error) {
          console.warn(`[SCORM-TRANSLATOR] Error traduciendo elemento ${item.id}:`, error.message);
          translations[item.id] = item.text; // Mantener original si falla
        }
      });

      await Promise.all(promises);

      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }

      // Pequeña pausa entre lotes
      if (i + batchSize < translatableElements.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Reconstruir HTML
    translatableElements.forEach((item) => {
      const element = doc.querySelector(`[data-translate-id="${item.id}"]`);
      if (element) {
        element.removeAttribute('data-translate-id');
        element.textContent = translations[item.id] || item.text;
      }
    });

    return doc.documentElement.outerHTML;
  }

  // Obtener lista de idiomas soportados
  function getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  // Verificar si un idioma es regional
  function isRegionalLanguage(code) {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang ? lang.regional : false;
  }

  window.MultiTraceTranslator = {
    translateText,
    translateHtml,
    getSupportedLanguages,
    isRegionalLanguage,
    detectAvailableService,
    getCurrentService: () => currentService
  };

  console.log('[SCORM-TRANSLATOR] Módulo de traducción cargado');
})();
