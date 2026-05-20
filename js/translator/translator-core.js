(function () {
  const translator = window.MultiTraceTranslator;
  const patcher = window.MultiTraceTranslatorPatch;

  // Detectar idioma del contenido HTML (heurística simple)
  function detectLanguageFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Intentar obtener el atributo lang del HTML
    const htmlLang = doc.documentElement.getAttribute('lang');
    if (htmlLang) {
      return htmlLang.split('-')[0]; // es-ES -> es
    }

    // Analizar texto para detección básica
    const bodyText = doc.body ? doc.body.textContent : '';
    const sampleText = bodyText.substring(0, 500).toLowerCase();

    // Palabras comunes por idioma
    const languagePatterns = {
      es: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con'],
      ca: ['el', 'la', 'de', 'que', 'i', 'a', 'en', 'un', 'és', 'es', 'no', 'li', 'ho', 'els', 'les', 'del', 'als'],
      eu: ['eta', 'da', 'bat', 'ez', 'dira', 'baita', 'hau', 'hori', 'zer', 'izan', 'egin', 'du', 'ditu'],
      gl: ['o', 'a', 'de', 'que', 'e', 'en', 'un', 'é', 'se', 'non', 'te', 'o', 'lle', 'da', 'seu', 'por', 'son'],
      en: ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do'],
      fr: ['le', 'la', 'de', 'et', 'à', 'un', 'être', 'avoir', 'que', 'pour', 'dans', 'ce', 'il', 'qui', 'les', 'des'],
      de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem'],
      pt: ['o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'na'],
      it: ['il', 'di', 'che', 'e', 'la', 'il', 'un', 'a', 'per', 'è', 'in', 'una', 'sono', 'l\'', 'si', 'le']
    };

    let scores = {};
    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      scores[lang] = 0;
      patterns.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        const matches = sampleText.match(regex);
        if (matches) {
          scores[lang] += matches.length;
        }
      });
    }

    // Obtener idioma con mayor puntuación
    let maxScore = 0;
    let detectedLang = 'auto';
    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    // Umbral mínimo de confianza
    if (maxScore < 3) {
      return 'auto';
    }

    return detectedLang;
  }

  // Procesar traducción de un archivo ZIP SCORM
  async function translateZipFile(file, options) {
    console.log('[SCORM-TRANSLATOR] Iniciando traducción de ZIP:', file.name);

    const zip = await JSZip.loadAsync(file);
    const translatorService = window.MultiTraceTranslator;
    const patcherService = window.MultiTraceTranslatorPatch;

    if (!translatorService) {
      throw new Error('No se ha cargado el servicio de traducción.');
    }

    if (!patcherService) {
      throw new Error('No se ha cargado el módulo de parche de traducción.');
    }

    // Detectar tipo de paquete SCORM
    const detectedType = await detectScormType(zip);
    console.log('[SCORM-TRANSLATOR] Tipo detectado:', detectedType);

    // Obtener archivos HTML a traducir según el tipo
    const htmlFiles = await getHtmlFilesForType(zip, detectedType);
    
    if (htmlFiles.length === 0) {
      throw new Error('No se encontraron archivos HTML para traducir en este paquete SCORM.');
    }

    console.log(`[SCORM-TRANSLATOR] Archivos HTML encontrados: ${htmlFiles.length}`);

    // Determinar idiomas
    const sourceLang = options.sourceLang || 'auto';
    const targetLang = options.targetLang || 'en';

    // Leer primer archivo para detectar idioma si es auto
    let actualSourceLang = sourceLang;
    if (sourceLang === 'auto' && htmlFiles.length > 0) {
      const firstFile = zip.file(htmlFiles[0]);
      if (firstFile) {
        const html = await firstFile.async('string');
        actualSourceLang = detectLanguageFromHtml(html);
        console.log('[SCORM-TRANSLATOR] Idioma detectado:', actualSourceLang);
      }
    }

    // Traducir cada archivo HTML
    const totalFiles = htmlFiles.length;
    let translatedCount = 0;

    for (const htmlPath of htmlFiles) {
      const entry = zip.file(htmlPath);
      if (!entry) continue;

      let html = await entry.async('string');
      
      // Verificar si ya está traducido
      const alreadyTranslated = patcherService.hasExistingTranslation(html);
      if (alreadyTranslated && !options.force) {
        console.log(`[SCORM-TRANSLATOR] Saltando ${htmlPath}: ya traducido`);
        continue;
      }

      // Eliminar traducción previa si se fuerza
      if (alreadyTranslated && options.force) {
        html = patcherService.removeExistingTranslation(html);
      }

      console.log(`[SCORM-TRANSLATOR] Traduciendo ${htmlPath} (${actualSourceLang} -> ${targetLang})`);

      try {
        const translatedHtml = await translatorService.translateHtml(
          html,
          actualSourceLang,
          targetLang,
          (current, total) => {
            if (options.onProgress) {
              options.onProgress(translatedCount + (current / total), totalFiles);
            }
          }
        );

        // Inyectar metadatos de traducción
        const metadata = patcherService.buildTranslationMetadata(
          actualSourceLang,
          targetLang,
          Date.now()
        );
        const finalHtml = patcherService.injectTranslationMetadata(translatedHtml, metadata);

        zip.file(htmlPath, finalHtml);
        translatedCount++;

        console.log(`[SCORM-TRANSLATOR] Traducido: ${htmlPath}`);
      } catch (error) {
        console.warn(`[SCORM-TRANSLATOR] Error traduciendo ${htmlPath}:`, error.message);
        // Continuar con el siguiente archivo en lugar de fallar todo
      }

      if (options.onProgress) {
        options.onProgress(translatedCount, totalFiles);
      }

      // Pausa entre archivos para evitar rate limiting
      if (translatedCount < totalFiles) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generar ZIP de salida
    const outputBlob = await zip.generateAsync({ type: 'blob' });

    const baseName = file.name.replace(/\.zip$/i, '');
    const outputName = `${baseName}_${targetLang}.zip`;

    return {
      blob: outputBlob,
      outputName: outputName,
      message: `Traducción completada: ${translatedCount}/${totalFiles} archivos traducidos (${actualSourceLang} → ${targetLang})`,
      translatedCount,
      totalFiles,
      sourceLang: actualSourceLang,
      targetLang: targetLang,
      packageType: detectedType
    };
  }

  // Detectar tipo de paquete SCORM (usando los detectores existentes)
  async function detectScormType(zip) {
    const riseDetector = window.MultiTraceRiseDetector;
    const storylineDetector = window.MultiTraceStorylineDetector;
    const exeDetector = window.MultiTraceExeLearningDetector;

    if (riseDetector) {
      const riseIndex = riseDetector.findPreferredIndex(zip);
      if (riseIndex) {
        const riseInfo = await riseDetector.detect(zip, riseIndex);
        if (riseInfo.looksLikeRise) {
          return 'rise';
        }
      }
    }

    if (storylineDetector) {
      const storyEntry = storylineDetector.findPreferredEntry(zip);
      if (storyEntry) {
        const storyInfo = await storylineDetector.detect(zip, storyEntry);
        if (storyInfo.looksLikeStoryline) {
          return 'storyline';
        }
      }
    }

    if (exeDetector) {
      const exeIndex = exeDetector.findPreferredIndex(zip);
      if (exeIndex) {
        const exeInfo = await exeDetector.detect(zip, exeIndex);
        if (exeInfo.looksLikeExe) {
          return 'exelearning';
        }
      }
    }

    return 'unknown';
  }

  // Obtener archivos HTML según el tipo de paquete
  async function getHtmlFilesForType(zip, packageType) {
    const allFiles = Object.keys(zip.files);

    switch (packageType) {
      case 'rise':
        // Rise: buscar index.html en scormcontent/ o raíz
        return allFiles.filter(path => 
          path.match(/index\.html?$/i) && 
          (path.match(/scormcontent\//i) || !path.includes('/'))
        );

      case 'storyline':
        // Storyline: buscar story.html y otros HTML relevantes
        return allFiles.filter(path => 
          path.match(/story\.html?$/i) || 
          (path.match(/\.html?$/i) && !path.includes('/_'))
        );

      case 'exelearning':
        // eXeLearning: leer imsmanifest.xml para obtener recursos
        const manifestFile = zip.file('imsmanifest.xml');
        if (manifestFile) {
          const manifestXml = await manifestFile.async('string');
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(manifestXml, 'application/xml');
          
          const resources = xmlDoc.querySelectorAll('resource[type=\'webcontent\']');
          const htmlFiles = [];
          for (const res of resources) {
            const href = res.getAttribute('href');
            if (href && href.match(/\.html?$/i)) {
              htmlFiles.push(href);
            }
          }
          
          if (htmlFiles.length > 0) {
            return htmlFiles;
          }
        }
        
        // Fallback: todos los HTML que no estén en carpetas ocultas
        return allFiles.filter(path => 
          path.match(/\.html?$/i) && !path.includes('/_')
        );

      default:
        // Desconocido: intentar encontrar cualquier HTML
        return allFiles.filter(path => 
          path.match(/\.html?$/i) && !path.includes('/_')
        );
    }
  }

  window.MultiTraceTranslatorCore = {
    translateZipFile,
    detectScormType,
    getHtmlFilesForType,
    detectLanguageFromHtml
  };

  console.log('[SCORM-TRANSLATOR-CORE] Módulo core de traducción cargado');
})();
