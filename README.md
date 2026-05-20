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

## Siguiente paso recomendado

Extraer una capa de estrategias de inyección para separar aún más:
- detección
- validación
- construcción de parche
- localización del punto de inyección
