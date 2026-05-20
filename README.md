# Multi Trace Tool

## Qué cambia

Esta versión prepara la herramienta para soportar varios sistemas mediante adaptadores.

## Arquitectura

- `js/core/trace-registry.js`: registro de adaptadores.
- `js/core/zip.js`: resuelve el adaptador compatible y delega el procesado.
- `js/adapters/`: un adaptador por sistema.
- `js/patches/`: parches por sistema.
- `js/bootstrap/register-adapters.js`: alta centralizada de adaptadores.

## Cómo añadir un nuevo sistema

1. Crear `js/patches/<sistema>-trace.js` con la lógica de inyección.
2. Crear `js/adapters/<sistema>-adapter.js` con:
   - `id`
   - `label`
   - `matches(zip, context)`
   - `process(zip, file, options)`
3. Registrar el adaptador en `js/bootstrap/register-adapters.js`.

## Contrato del adaptador

`matches(zip, context)` debe devolver `true` cuando el paquete pertenece al sistema.

`process(zip, file, options)` debe devolver un objeto con:

```js
{
  blob,
  outputName,
  message,
  already,
  downloadable
}
```

## SCORM Translator Tool

Herramienta web para traducción automática de paquetes SCORM usando servicios gratuitos.

### Características

- **Autodetección de arquitectura**: Soporta RISE, Storyline 360 y eXeLearning
- **Servicios gratuitos**: Utiliza LibreTranslate y MyMemory (sin API key requerida)
- **Idiomas soportados**:
  - Internacionales: Inglés, Francés, Alemán, Portugués, Italiano, Neerlandés, Polaco, Ruso, Chino, Japonés, Coreano, Árabe
  - Regionales de España: Catalán, Euskera, Gallego
- **Detección automática de idioma de origen**
- **Traducción por lotes** con progreso detallado
- **Metadatos de traducción** incrustados en el HTML

### Ubicación

La herramienta está disponible en: `js/translator/index.html`

### Módulos

- `translation-service.js`: Conexión con servicios de traducción gratuitos
- `translator-patch.js`: Gestión de metadatos de traducción en HTML
- `translator-core.js`: Lógica principal de traducción de SCORM
- `translator-app.js`: Interfaz de usuario y control de la aplicación

### Uso

1. Abrir `js/translator/index.html` en un navegador
2. Arrastrar paquetes SCORM (.zip) al área designada
3. Seleccionar idioma de origen (o dejar en "Detectar automáticamente")
4. Seleccionar idioma de destino
5. Click en "Traducir paquetes"
6. Descargar los paquetes traducidos individualmente o en lote

### Servicios de traducción

La herramienta intenta conectarse automáticamente a los siguientes servicios:

1. **LibreTranslate**: Servicio open-source de traducción
   - Endpoints: libretranslate.com, translate.astian.org, lt.rashev.org
   
2. **MyMemory**: API gratuita con límite de uso
   - Endpoint: api.mymemory.translated.net

La conexión se prueba automáticamente al cargar la página. Si ningún servicio está disponible, se mostrará un mensaje de error.

## Siguiente paso recomendado

Extraer una capa de estrategias de inyección para separar aún más:
- detección
- validación
- construcción de parche
- localización del punto de inyección
