# Bitácora de errores de análisis de documentos

Última actualización: 2026-09-28.

## Objetivo y alcance

Registrar los incidentes reportados al analizar archivos, junto con pruebas exitosas comparables, para identificar constantes y orientar una solución de raíz. Separar evidencia, observaciones del usuario e hipótesis. Esta bitácora es manual; las correcciones de código se documentan al final, sin borrar la evidencia original.

El usuario reporta recurrencia con archivos más grandes y con más slides. Por ahora hay **un incidente con evidencia detallada** y **una prueba exitosa reportada sin métricas**. No se dispone aquí de datos verificables de los incidentes anteriores; no se cuentan como casos independientes.

## Comparativa acumulada

| Registro | Resultado | Archivo / formato | Bytes registrados | Slides | Fase | Duración | HTTP | Modelo / thinking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ERR-001 | Timeout | Creative Direction Ziploc / PPTX | 6,144,211 | No informado | scope | 90,008 ms | 504 | gemini-3.8-flash / MEDIUM |
| CTRL-001 | Funcionó según el usuario | Archivo más pequeño; nombre y formato no informados | No informado | No informado | No informada | No informada | No registrado | No informado |

`documentBytes` mide la suma de bytes decodificados del contenido base64 según el código consultado; no mide tokens, cantidad de slides ni el tamaño total del request HTTP. Los 6,144,211 bytes equivalen aproximadamente a 5.86 MiB (la interfaz muestra “5.86 MB”).

## ERR-001 — Timeout durante la interpretación inicial

Estado: corrección del corte de 90 segundos implementada; pendiente de confirmar con el PPTX original y el proveedor real. La causa de la latencia del proveedor no está confirmada.

### Evidencia recibida

- Fecha de inicio registrada: `2026-09-28T16:37:45.877Z` (UTC).
- Hora de inicio mostrada en la captura: `10:37:45 a.m.`.
- Entorno de la captura: `localhost:5173/intent`.
- Archivo: `WS3_-North-America-Creative-Direction-FY27-ALB-Ziploc-Holiday-Equity.pptx`.
- Texto ingresado: `check the file`.
- Acción / etapa: `Find the best path` / `Scope interpretation`.
- Endpoint con error: `api/brief/analyze`.
- Chrome: `Failed to load resource: the server responded with a status of 504 (Gateway Timeout)`.
- Mensaje visible: `The Monks AI assistant took too long to respond. Your text and files are still here. Please retry.`
- El archivo y el texto permanecen visibles después del error.
- Referencia local de la captura: `/Users/fredyrivas/Downloads/screencapture-localhost-5173-intent-2026-09-28-10_41_27.png` (no copiada al repositorio).
- Origen del trace: consola de Chrome, `app.tsx:1216`, etiqueta `[Brief AI request]`.

Trace transcrito del reporte del usuario:

```json
{
  "createdAt": "2026-09-28T16:37:45.877Z",
  "durationMs": 90008,
  "id": "ed327044-97e4-4e97-b901-a4908134bfab",
  "inputTokens": null,
  "model": "gemini-3.8-flash",
  "outputTokens": null,
  "phase": "scope",
  "reason": "Initial scope and decision-tree routing require the strongest classification pass.",
  "requestSummary": {
    "catalogFields": 93,
    "confirmedFields": 0,
    "documentMetadata": 1,
    "documentContents": 1,
    "documentBytes": 6144211
  },
  "thinkingLevel": "MEDIUM",
  "thinkingTokens": null,
  "totalTokens": null
}
```

El mensaje `Download the React DevTools for a better development experience` es informativo; no constituye el error de análisis.

### Comprobación estática del código local

Revisión inicial realizada el 2026-09-28, antes de la corrección, sobre un árbol de trabajo con cambios previos sin commit. No confirma qué versión exacta estaba ejecutándose al capturar el error. Los límites siguientes describen el comportamiento anterior.

- En `server/brief-analysis.ts`, la llamada a `client.models.generateContent` recibe `AbortSignal.timeout(90000)`.
- El bloque de error del mismo archivo responde `504` cuando `generationSignal?.aborted` y devuelve el mensaje observado.
- En `src/app.tsx`, la petición tiene un timeout de `100000` ms.
- La duración reportada de `90008` ms es consistente con el límite de 90 segundos del servidor. Esto explica el mecanismo probable del corte, pero no por qué el análisis demoró tanto.
- Los tokens son `null`: no hay métricas de consumo disponibles. No deben interpretarse como cero ni como evidencia de un límite de tokens alcanzado.

### Comparación reportada: CTRL-001

El usuario probó con un archivo más pequeño y funcionó. No se adjuntaron nombre, bytes, slides, duración ni trace de esa prueba. Tampoco está confirmado que las demás condiciones fueran idénticas. Sirve como indicio de correlación con la carga del documento, no como prueba causal controlada.

## Patrón provisional y límites

- **Observación del usuario:** los errores reaparecen con archivos más grandes y con más slides.
- **Evidencia de este caso:** un PPTX con 6,144,211 bytes registrados falla en `scope` tras aproximadamente 90 segundos; un archivo más pequeño funcionó según el usuario.
- **Hipótesis a contrastar:** el volumen o la complejidad del documento aumenta la latencia del análisis hasta superar el límite de la llamada al modelo.
- **Aún no demostrado:** relación independiente con cantidad de slides, imágenes, texto extraído, tokens, latencia del proveedor o configuración de thinking. Tampoco hay un umbral de tamaño seguro identificado.
- **Criterio para una mitigación de raíz:** medir dónde se consume el tiempo y comparar casos equivalentes antes de decidir si corresponde reducir/dividir el contenido, separar extracción y clasificación, o cambiar el flujo de procesamiento. Aumentar el timeout por sí solo no demuestra que la causa esté resuelta.

## Datos para los próximos registros

Registrar también casos exitosos, conservando condiciones comparables cuando sea posible:

1. Fecha, entorno, versión del código e ID de request.
2. Nombre, formato, tamaño original, `documentBytes` y cantidad de slides/páginas.
3. Texto enviado, fase, número de archivos, campos del catálogo y campos confirmados.
4. Modelo, thinking, duración, HTTP, mensaje y trace completo, incluidos tokens disponibles.
5. Log del servidor asociado al mismo intento y, si existen, tiempos separados de extracción y llamada al modelo.
6. Resultado de reintentar el mismo archivo y de probar una versión reducida; indicar qué cambió.

Usar “no informado” cuando falte un dato. No sobrescribir incidentes anteriores ni registrar secretos, credenciales o contenido sensible innecesario.

### Plantilla de siguiente incidente

```text
ID: ERR-002
Estado:
Fecha / entorno / versión:
Request ID:
Archivo / formato:
Tamaño original / documentBytes / slides o páginas:
Texto enviado / fase:
Modelo / thinking:
Duración / HTTP / mensaje:
Request summary / tokens:
Evidencia (captura, trace, log del servidor):
Comparación o reintento:
Hechos confirmados:
Hipótesis:
Datos faltantes:
Mitigación aplicada y resultado (si corresponde):
```

## Corrección implementada — 2026-09-28

### Diagnóstico y decisión

El código anterior imponía 90 segundos a la llamada al modelo y 100 segundos a la petición del navegador, independientemente de la carga documental. El corte de 90,008 ms coincide con ese límite del servidor. Para un PPTX, el servidor extrae texto y agrega imágenes embebidas: el tamaño del ZIP no basta para predecir el trabajo multimodal. No hay evidencia suficiente para atribuir la lentitud a una slide, imagen, búsqueda web o comportamiento concreto del proveedor.

Se eliminó la dependencia entre la duración del análisis y una única conexión HTTP abierta. Además, se amplió el presupuesto de la llamada con documentos. Esta corrección permite terminar análisis que excedan 90 segundos; no garantiza que cualquier documento termine en un tiempo finito ni demuestra que se haya optimizado la latencia del modelo.

### Cambios concretos

- `src/request-brief-analysis.ts`: envía el contenido una sola vez mediante `POST /api/brief/analyze?async=1`. Recibe `202` con `jobId` y consulta `GET /api/brief/analyze?job=…` cada segundo hasta obtener resultado o error. El presupuesto total del cliente es de seis minutos.
- `src/app.tsx`: usa ese flujo y conserva el manejo de resultados, errores y traces. No vuelve a subir el PPTX en cada consulta.
- `server/brief-analysis.ts`: valida la entrada antes de aceptar el trabajo, responde `202` y continúa procesándolo en el servidor. Las consultas de estado funcionan mientras el análisis está ocupado. Se conserva la exclusión de análisis simultáneos (`429`) y la compatibilidad del POST sin `async=1` para consumidores existentes.
- La llamada al modelo dispone de cinco minutos cuando se envía contenido documental; sin contenido mantiene 90 segundos. Ambos límites siguen acotados. Si el proveedor supera el nuevo presupuesto, se conserva el error `504` con el trace disponible.
- `server/analysis-jobs.ts`: retiene estados y resultados en memoria, con un máximo de 20 entradas y caducidad de diez minutos; las entradas caducadas se limpian en el siguiente acceso. El almacén no guarda los documentos originales. Los errores finales conservan su código y trace. Un servidor reiniciado o un resultado caducado produce `404` con un mensaje para reintentar.
- El ID del trabajo coincide con el ID del trace. `shared/brief-contract.ts` incorpora métricas opcionales: `preparationMs`, `promptCharacters`, `inlineParts` e `inlineBytes`, disponibles en el trace de consola. Permiten separar preparación local y carga enviada de la duración de la generación; no miden el tiempo individual de cada operación del proveedor ni el número de slides.

No se modificaron la selección del modelo ni los límites existentes de extracción del PPTX. Los cambios previos del árbol de trabajo se conservaron.

### Validación realizada

- `node --test server/analysis-jobs.test.mjs src/request-brief-analysis.test.mjs server/model-routing.test.mjs`: **13 pruebas aprobadas**.
- Caso de regresión: reloj simulado de 120 segundos, una sola subida y 120 consultas; se obtiene el resultado final. No es una medición real del proveedor.
- Otros casos: conservación del error y trace, caducidad, límite de resultados retenidos, validación fallida sin polling, rechazo de ID inválido y reglas existentes de selección del modelo.
- `npx tsc --noEmit -p tsconfig.node.json`: aprobado para el código del servidor.
- ESLint dirigido a `server/analysis-jobs.ts`, `server/brief-analysis.ts`, `src/request-brief-analysis.ts`, `src/app.tsx` y `shared/brief-contract.ts`: aprobado.
- No se ejecutaron build, suite completa, navegador ni llamadas reales al proveedor.

### Verificación pendiente y límites

Repetir el análisis del PPTX original con el servidor actualizado y registrar el nuevo trace junto a ERR-001. La captura y el log originales no permiten verificar su resultado real después del cambio. Si el servidor de desarrollo no recarga el plugin, reiniciarlo antes de esa prueba.

Los trabajos son locales y no persistentes: reiniciar el servidor los pierde. La recarga de la página no reanuda automáticamente el polling. Si el mismo archivo supera cinco minutos, hace falta usar las nuevas métricas y el log del proveedor para decidir una reducción o división del trabajo; no registrar ese caso como resuelto ni seguir aumentando límites sin evidencia.
