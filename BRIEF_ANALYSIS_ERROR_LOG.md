# Bitácora de errores de análisis de documentos

Última actualización: 2026-09-30.

## Objetivo y alcance

Registrar los incidentes reportados al analizar archivos, junto con pruebas exitosas comparables, para identificar constantes y orientar una solución de raíz. Separar evidencia, observaciones del usuario e hipótesis. Esta bitácora es manual; las correcciones de código se documentan al final, sin borrar la evidencia original.

El usuario reporta recurrencia. Hay cuatro incidentes con evidencia y una prueba exitosa reportada sin métricas. No se dispone aquí de datos verificables de los demás intentos anteriores; no se cuentan como casos independientes.

## Comparativa acumulada

| Registro | Resultado | Archivo / formato | Bytes registrados | Slides | Fase | Duración | HTTP | Modelo / thinking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ERR-001 | Timeout | Creative Direction Ziploc / PPTX | 6,144,211 | No informado | scope | 90,008 ms | 504 | gemini-3.8-flash / MEDIUM |
| ERR-002 | Petición rechazada | Creative Direction Ziploc / PPTX | ~82,935 (archivo local con el mismo nombre; trace: 0.08 MB) | No informado | document-reading | 4,126 ms | No visible en captura; 502 en reproducción sintética | gemini-3.8-flash / MEDIUM |
| ERR-003 | JSON sin terminar; lectura previa exitosa | WS3_-North-America-Creative-Direction-Ziploc-Holiday-FY27.pptx | Scope: 0 (solo referencia; fuente retenida en Interactions) | No informado | scope | 88,564 ms | 502 de la aplicación | gemini-3.8-flash / MEDIUM |
| ERR-004 | Estado `requires_action` descartado; interacción guardada completada | PPTX de 6.1 MB reportado; nombre no informado | Scope: 0 (referencia); bytes originales no informados | No informado | scope | 58,675 ms | 502 de la aplicación | gemini-3.8-flash / MEDIUM |
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

## ERR-002 — Vertex rechaza el esquema de lectura de documentos

Estado: causa reproducida y corrección implementada; falta repetir el PPTX del usuario en la interfaz.

### Evidencia del reporte del 2026-09-29

- Captura en `localhost:5173/intent`, aproximadamente a las 3:23 p.m.; archivo `WS3_-North-America-Creative-Direction-Ziploc-Holiday-FY27.pptx` y mensaje `check the file` conservados tras el fallo.
- Aviso visible: `The Monks AI assistant could not finish reading this request. Your text and files are still here. Please retry.`
- Registro avanzado compartido por el usuario: `Source reading`, inicio a las 3:21:59 p.m., `gemini-3.8-flash`, `MEDIUM`, 4,126 ms, una referencia y un contenido documental (0.08 MB), cero campos de catálogo; tokens no disponibles. No se compartieron ID de petición ni código HTTP del intento original.
- Existe un archivo local con el mismo nombre de 82,935 bytes. La extracción local terminó correctamente: 2,408 caracteres de texto y una imagen embebida de 24,278 bytes. Esto no demuestra que el proveedor haya leído el contenido del intento original.

### Reproducción y causa

La integración sintética `node scripts/check-brief-analysis.mjs` reprodujo el mismo aviso en `document-reading`: HTTP 502 de la aplicación tras un `400 invalid_request` de Vertex, sin tokens, en 3,473 ms. La respuesta subyacente fue `Request contains an invalid argument.` El esquema de `response_format` para lectura incluía `maxItems: 150` en `facts`. Con texto sintético y el resto de la petición equivalente, Vertex rechazó el esquema completo; aceptó el mismo esquema al quitar `maxItems`. Quitar solo `additionalProperties` no resolvió el rechazo. Las peticiones simples, con instrucciones y con configuración de generación funcionaron. Por tanto, la incompatibilidad observada está en `maxItems` dentro de este flujo de Interactions, aunque la [documentación general de salida estructurada de Google](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output) lo enumera como campo admitido. No hay evidencia de un problema de tamaño del PPTX en este incidente.

### Corrección

`server/brief-instruction.ts` elimina `maxItems` recursivamente de los esquemas que envía a Vertex Interactions. El límite de 150 hechos continúa aplicado por `parseSourceReading` al validar la respuesta; las propuestas y preguntas se siguen filtrando localmente según el catálogo y la fase. `shared/brief-config.test.mjs` comprueba que ninguna fase vuelva a enviar `maxItems`. El motivo mostrado en el trace de `document-reading` ahora describe la lectura de fuentes, en vez de atribuirle criterios de rutas que se evalúan en Scope.

Validación: las quince pruebas dirigidas de configuración, selección de modelo e interacción, el chequeo de tipos del servidor y `git diff --check` aprobaron. La misma integración sintética con Vertex, repetida después de la corrección, completó `document-reading` y `scope` con HTTP 200 y propuestas con evidencia del PDF. No se envió el PPTX del usuario al proveedor para esta comprobación; repetirlo en la interfaz sigue pendiente.

## Patrón provisional y límites

- **Observación del usuario:** los errores reaparecen con archivos más grandes y con más slides.
- **Evidencia de este caso:** un PPTX con 6,144,211 bytes registrados falla en `scope` tras aproximadamente 90 segundos; un archivo más pequeño funcionó según el usuario.
- **ERR-002 es un mecanismo distinto:** un PPTX de aproximadamente 0.08 MB falló en `document-reading` en 4.1 segundos por un esquema rechazado por Vertex. No se debe agrupar con el timeout de ERR-001 ni atribuirlo al tamaño.
- **ERR-003 es otro mecanismo:** el proveedor devolvió texto que no era JSON completo después de una lectura exitosa. Su consumo de razonamiento y respuesta está prácticamente en el tope de generación configurado. Véase el diagnóstico del 2026-09-30 al final; la falta de archivos inline en Scope no elimina el contexto documental retenido.
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
ID: ERR-003
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

## ERR-003 — JSON truncado en Scope — 2026-09-30

Estado: mecanismo de fallo confirmado con el log del servidor; agotamiento del presupuesto combinado como causa fuertemente sustentada. Corrección y recuperación verificadas con pruebas dirigidas; pendiente la repetición con el proveedor real y el PPTX original.

### Evidencia recibida

- Captura: `/Users/fredyrivas/Desktop/Captura de pantalla 2026-09-30 a la(s) 10.35.07 a.m..png`, `localhost:5173/intent`.
- Archivo visible: `WS3_-North-America-Creative-Direction-Ziploc-Holiday-FY27.pptx`; mensaje: `check the file`.
- HTTP visible: 502 en la consulta de un trabajo de análisis. El 502 lo devuelve la aplicación; no demuestra un HTTP 502 de Vertex.
- Scope: inicio visible a las 10:28:55 a.m., duración 88,564 ms, `gemini-3.8-flash`, `MEDIUM`, 11 campos de catálogo, cero valores confirmados, una referencia documental, cero contenidos documentales enviados en esa llamada.
- Tokens: entrada 8,860; salida 476; razonamiento 11,517; total 20,853.
- El usuario compartió el log de Vite: `document-reading` terminó correctamente en 22,555 ms; Scope falló en `JSON.parse`, dentro de `interactionResponse`, con `SyntaxError: Unterminated string in JSON at position 1456 (line 49 column 31)`.
- El log original no incluye ID completo, JSON recibido, estado literal de la interacción ni motivo de finalización. El código anterior solo llegaba a ese `JSON.parse` después de comprobar `status === 'completed'`; por ello, el estado aprobado por ese guard no garantizó JSON íntegro. No se debe depender exclusivamente de `status: incomplete` para recuperar una respuesta truncada.

### Causa y por qué reaparecía

**Confirmado:** este intento leyó la fuente, recibió una respuesta del proveedor y falló al deserializarla. No fue un fallo de extracción del PPTX ni el rechazo de esquema de ERR-002. Los 88,564 ms tampoco coinciden con el corte duro de ERR-001: el error compartido es de sintaxis JSON, no de timeout.

**Causa fuertemente sustentada:** todas las fases enviaban `generation_config.max_output_tokens: 12000` con razonamiento MEDIUM en lectura y Scope. El consumo de esta captura es `11517 + 476 = 11993` tokens generados, a solo siete del límite. La [documentación oficial de Google sobre thinking](https://ai.google.dev/gemini-api/docs/thinking) explica que `max_output_tokens` incluye razonamiento y respuesta, y que es un corte duro que no adapta el presupuesto de thinking. Un modelo puede consumir casi todo el presupuesto razonando y dejar insuficiente espacio para terminar el JSON. La proximidad al tope y el JSON sin terminar sustentan esta atribución; falta el motivo original de finalización para una confirmación directa del corte por tokens.

La implementación tenía además dos debilidades que convertían este mecanismo recuperable en un fallo visible y dificultaban diagnosticar la recurrencia:

1. `interactionResponse` parseaba JSON una sola vez y el servidor no regeneraba respuestas truncadas, JSON mal formado ni respuestas que incumplían la validación local.
2. El `catch` general presentaba extracción fallida, rechazo del proveedor, JSON inválido y evidencia inválida como el mismo 502 con el mismo aviso. El trace mostraba tiempos y tokens, pero no el resultado, estado del proveedor o etapa del fallo.

Las correcciones anteriores atendieron mecanismos reales pero diferentes: separar el trabajo de la conexión HTTP y ampliar el timeout no arregla un JSON cortado por tokens; retirar `maxItems` no reserva espacio para la respuesta. Una prueba exitosa con un PDF pequeño tampoco cubre este caso de agotamiento del presupuesto. La variación entre documentos y generaciones puede cambiar cuánto razonamiento usa el modelo, haciendo intermitente el fallo.

### Corrección implementada

- Se retira el tope global arbitrario de 12,000 tokens. Se utiliza el límite predeterminado del modelo y `thinking_level` como control de razonamiento, siguiendo la recomendación de Google. Se conserva MEDIUM en el primer intento de lectura y Scope y la selección de modelos existente.
- Una respuesta `incomplete`/`budget_exceeded`, un JSON inválido (incluso con estado `completed`) o una respuesta rechazada por las reglas locales obtiene **una sola regeneración automática**. La recuperación usa LOW, excepto si la selección ya era MINIMAL, y solicita JSON completo y conciso con las mismas reglas de evidencia.
- La regeneración usa el mismo input y el último `previous_interaction_id` validado. Nunca encadena el ID de la respuesta inválida, nunca guarda un contexto inválido y nunca acepta evidencia inventada para evitar el error. En Scope, el navegador no vuelve a subir el PPTX; en lectura, una recuperación vuelve a enviar el input documental al proveedor porque aún no existe un checkpoint validado.
- Ambas generaciones comparten un único plazo de cinco minutos cuando hay documentos enviados o retenidos, o reasoning MEDIUM. Antes, Scope volvía al límite de 90 segundos por tener cero contenidos inline aunque conservaba la fuente en el historial de Interactions. Las fases simples sin esos requisitos mantienen 90 segundos. El cliente conserva sus seis minutos por trabajo.
- Los errores de petición del proveedor no se reintentan como si fueran JSON inválido. Se mantiene el protocolo existente `CONTEXT_UNAVAILABLE` para reconstruir una interacción expirada.
- Los traces incorporan resultado, código de error, etapa, HTTP del proveedor cuando existe, estado de interacción, plazo y consumos por respuesta recibida. Los totales suman los consumos disponibles de ambos intentos; si falta una métrica de alguno, se conserva `null`, sin interpretar falta de datos como cero.
- El registro avanzado muestra esos diagnósticos y el ID de request. Los logs del servidor registran datos estructurados sin el JSON parcial, documentos, credenciales ni el mensaje crudo del proveedor. Los nuevos códigos separan `INVALID_JSON`, `INCOMPLETE_OUTPUT`, `INVALID_ANALYSIS`, `INTERACTION_FAILED`, `PROVIDER_INVALID_REQUEST`, `PROVIDER_RATE_LIMIT`, `PROVIDER_ERROR`, `DOCUMENT_PREPARATION_FAILED` y `ANALYSIS_TIMEOUT`.

### Validación realizada y límites

- `node --test server/brief-recovery.test.mjs server/brief-interaction.test.mjs src/brief-analysis-flow.test.mjs`: **18 pruebas aprobadas**.
- Regresiones nuevas: JSON sin terminar con `completed` y con `incomplete`, usando los mismos conteos de tokens de la captura; recuperación desde el checkpoint válido con LOW; rechazo y regeneración de evidencia inventada; salida inválida repetida limitada a dos llamadas; recuperación de lectura; rechazo HTTP 400 sin regeneración; contexto expirado compatible con la reconstrucción existente. Se verifica también ausencia del antiguo tope, plazo compartido y suma de tokens.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json`: aprobado.
- ESLint dirigido a los cinco archivos de implementación y prueba afectados: aprobado.
- Se intentó `node scripts/check-brief-analysis.mjs` contra el servidor existente, usando exclusivamente el PDF sintético. El primer intento encontró la restricción de red del sandbox; el intento autorizado fuera de esa restricción terminó con `ECONNREFUSED 127.0.0.1:5173`. No había servidor disponible. No se ejecutó una llamada a Vertex ni se obtuvo un resultado real nuevo; no se arrancó otro servidor, se usó navegador ni se ejecutó build o suite completa.

La corrección elimina el límite artificial que sustenta este incidente y permite recuperación limitada. No garantiza que el proveedor nunca devuelva errores o agote su propio límite; tampoco certifica todavía el resultado real del PPTX original. Usar el presupuesto predeterminado puede permitir más tokens generados que antes: el plazo de ejecución y el único reintento siguen acotados. Para cerrar la verificación con el proveedor, iniciar el servidor actualizado y repetir el archivo original, conservando el nuevo trace, incluido el estado por intento.

## Manejo de errores y diagnóstico permanente — 2026-09-30

Esta sección documenta una mejora de implementación, no un incidente nuevo ni una confirmación del resultado real del PPTX.

### Qué se registra y dónde

- Cada análisis conserva un `requestId` estable, compartido por el job, el trace, la respuesta HTTP y el header `X-Request-ID`. Los rechazos anteriores a la llamada a Gemini también tienen una referencia y diagnóstico.
- Se distinguen origen (`browser`, `server`, `gemini`), etapa, código estable, HTTP de la aplicación y HTTP del proveedor cuando el SDK lo informa. Un error de JSON no se presenta como prueba de un HTTP 502 de Google. Si no existe un código HTTP del proveedor, no se inventa.
- El trace se crea antes de extraer los documentos: un ZIP/PPTX corrupto ahora conserva fase, configuración y referencia aunque nunca se llame a Gemini.
- Cada llamada al proveedor, incluidas las que rechaza el SDK, cuenta como un intento. Se registra duración, nivel de thinking, HTTP disponible, ID/estado de interacción, longitud del texto de respuesta y métricas de tokens disponibles. La longitud ayuda a caracterizar respuestas incompletas sin guardar su contenido. Si la recuperación termina en un error de conexión, el estado de la primera respuesta permanece solo en su intento y no se atribuye a la segunda llamada; el consumo total desconocido queda en `null`.
- El servidor guarda resultados y rechazos en `logs/brief-analysis-YYYY-MM-DD.jsonl`, usando la fecha UTC del registro. El directorio ya está excluido de Git. Este diario sobrevive a reinicios de Vite y no depende del guardado del borrador. No guarda el texto de la solicitud, nombres/contenido de archivos, JSON parcial, mensajes crudos de Google ni credenciales. Si el diario no puede escribirse, se avisa en consola sin sustituir el resultado del análisis. Los archivos se acumulan por fecha; no se implementa borrado automático.
- El cliente guarda los diagnósticos de los intentos fallidos junto al último contexto válido cuando el almacenamiento del borrador está disponible. No guarda una respuesta inválida como contexto válido. Si el propio guardado falla, se genera `CHECKPOINT_FAILED` con origen navegador y queda visible para exportación; no se puede prometer persistencia en un almacenamiento fallido.
- `Advanced · AI request log` muestra origen, etapa, HTTP de app/proveedor, intentos y referencias. `Download diagnostics` exporta el trace a JSON para compartir la evidencia sin copiar la solicitud ni el documento.

### Clasificación y límites del diagnóstico

| Caso | Código | HTTP de la aplicación | Interpretación |
| --- | --- | --- | --- |
| Entrada rechazada localmente | `INVALID_ANALYSIS_REQUEST` | 400 | No se llamó a Gemini |
| Acceso o método rechazado | `ANALYSIS_ACCESS_DENIED` / `ANALYSIS_METHOD_NOT_ALLOWED` | 403 / 405 | Restricción del servidor local |
| Otro análisis está ocupado | `ANALYSIS_BUSY` | 429 | Exclusión local; no equivale al rate limit de Google |
| Archivo no preparable | `DOCUMENT_PREPARATION_FAILED` | 422 | Fallo antes de generación |
| Contexto inexistente o expirado | `CONTEXT_UNAVAILABLE` | 409 | Reconstrucción limitada existente |
| Job no disponible tras reinicio/caducidad | `ANALYSIS_JOB_UNAVAILABLE` | 404 | No permite distinguir cuál de esas dos causas ocurrió |
| Autenticación/permisos del proveedor | `PROVIDER_AUTH_ERROR` | 503 | HTTP 401/403 informado por el proveedor |
| Configuración rechazada por proveedor | `PROVIDER_INVALID_REQUEST` | 502 | HTTP 400/422 informado por el proveedor |
| Límite temporal de solicitudes del proveedor | `PROVIDER_RATE_LIMIT` | 503 | HTTP 429 del proveedor; no prueba la cuota/capacidad específica agotada |
| Servicio remoto no disponible | `PROVIDER_UNAVAILABLE` | 503 | HTTP 5xx del proveedor |
| Respuesta incompleta/JSON inválido | `INCOMPLETE_OUTPUT` / `INVALID_JSON` | 502 | Respuesta no utilizable después de recuperación |
| Interacción sin completar con estado no recuperable | `INTERACTION_FAILED` | 502 | El estado de interacción y su ID quedan registrados; no determina por sí solo la causa remota |
| Evidencia o contrato inválido | `INVALID_ANALYSIS` | 422 | Validación local rechazada después de recuperación |
| Plazo de generación agotado | `ANALYSIS_TIMEOUT` | 504 | No identifica por sí solo por qué el proveedor demoró |
| Error de conexión servidor-proveedor sin HTTP disponible | `PROVIDER_ERROR` | 502 | Causa remota/red aún no determinada |
| Navegador no alcanza el servidor | `SERVER_CONNECTION_FAILED` | No disponible | Fallo observado en la conexión del navegador |
| Interrupción al consultar el job | `POLLING_CONNECTION_FAILED` | No disponible | Resultado final del servidor desconocido; conservar ID del job |
| Plazo del navegador agotado | `CLIENT_TIMEOUT` | No disponible | No equivale a un timeout confirmado de Gemini |
| Respuesta del servidor ilegible | `INVALID_SERVER_RESPONSE` | El recibido, si existe | Por ejemplo HTML en vez de JSON; no se confunde con JSON inválido generado por Gemini |
| Referencia de job inválida | `INVALID_JOB_REFERENCE` | 400 o el recibido por el navegador | Referencia rechazada; no se inicia polling sobre ella |
| Validación del cliente fallida | `CLIENT_VALIDATION_FAILED` | El recibido, si existe | Respuesta recibida pero contexto/contrato rechazado por el cliente |
| Guardado del contexto fallido | `CHECKPOINT_FAILED` | El recibido, si existe | Puede ocurrir después de una respuesta exitosa del servidor |

Para investigar: descargar el diagnóstico de la interfaz, localizar el mismo `requestId` en el diario y comparar origen, etapa, HTTP de cada capa, estados/IDs de interacción y consumos por intento. Los IDs permiten correlacionar; los códigos no convierten datos ausentes en certeza. Si el navegador no llegó a recibir una referencia del servidor, su ID local no garantiza correlación con un trabajo remoto.

### Validación realizada

- `node --test --test-reporter=spec server/analysis-errors.test.mjs server/brief-recovery.test.mjs server/brief-interaction.test.mjs src/request-brief-analysis.test.mjs src/brief-analysis-flow.test.mjs server/analysis-jobs.test.mjs`: **41 pruebas aprobadas**.
- Incluye clasificación de HTTP remoto frente al local, rechazo temprano con ID, archivo corrupto antes de Gemini, recuperación seguida de fallo remoto, evidencia inválida con 422, persistencia del diario con un nuevo escritor, fallo del diario sin afectar el resultado, desconexión inicial/polling, HTML inesperado, timeout del navegador y persistencia de errores conservando el contexto válido.
- Chequeo de tipos del servidor y chequeo dirigido de los tres módulos de cliente (request, flow y advanced log): aprobados. ESLint dirigido a implementación y pruebas afectadas: aprobado.
- No se ejecutaron suite completa, build, servidor, navegador ni nuevas llamadas reales a Vertex para esta mejora.

## ERR-004 — Scope descarta `requires_action` sin consultar el estado final — 2026-09-30

Estado: fallo de integración identificado y corregido. Se recuperó y validó la respuesta real de la misma interacción guardada; no se repitió la subida ni se generó un nuevo análisis del PPTX. Falta confirmar el recorrido completo en la interfaz con el servidor actualizado.

### Evidencia del intento original

- Diagnóstico adjunto: `/Users/fredyrivas/Downloads/analysis-e3fa465f-2744-41a4-ace1-c03d676004db.json`.
- Request ID: `e3fa465f-2744-41a4-ace1-c03d676004db`.
- Inicio: `2026-09-30T18:11:33.850Z` (12:11:33 p.m. de Ciudad de México).
- Usuario: prueba con un PPTX de 6.1 MB. Nombre, bytes exactos y cantidad de slides no informados en el diagnóstico adjunto.
- Fase: `scope`; modelo `gemini-3.8-flash`, MEDIUM; configuración `1/2026-09-29.2/2/1`.
- Duración: 58,675 ms; plazo: 300,000 ms.
- Tokens: entrada 21,512; salida 1,462; thinking 5,120; total 28,094. Los tokens generados suman 6,582; no hay evidencia de agotamiento del antiguo presupuesto ni del plazo.
- Un intento; estado recibido `requires_action`; `INTERACTION_FAILED`, etapa `response`, origen `gemini`, HTTP 502 de la aplicación. No hay código HTTP de error del proveedor en el diagnóstico.
- ID de interacción: `ChA2NTZiN2RiZjliZGU0ZTI0EAgaATAqBG1haW4`; texto de respuesta: 4,755 caracteres.
- El diario local conserva un registro coincidente con el mismo request ID y las mismas métricas.

### Investigación real y causa confirmada

Se consultó el mismo ID mediante `client.interactions.get`, sin subir el archivo ni generar una nueva respuesta. Vertex devolvió **`completed`**. La interacción guardada incluía pasos `user_input`, `thought`, `model_output`, una `google_search_call` y su `google_search_result` con el mismo call ID; no se encontraron llamadas `function_call` pendientes. El JSON final era válido, de 4,755 caracteres, con seis propuestas y cinco preguntas.

El código aceptaba exclusivamente `status === 'completed'` en la respuesta inicial de `create`. Todo otro estado se convertía en `INTERACTION_FAILED`; ese código tampoco entraba en la recuperación. Nunca se consultaba el recurso almacenado para resolver un estado no final. Así, el servidor descartó un análisis que estaba disponible como completado en Vertex.

La [documentación de Google](https://ai.google.dev/gemini-api/docs/streaming) distingue funciones ejecutadas por el cliente de herramientas integradas como Google Search, que ejecuta el proveedor. Este caso no requería ejecutar una función local, pedir al usuario una acción ni aceptar un JSON parcial como definitivo: requería reconciliar el estado recibido con el recurso guardado.

No se puede determinar retrospectivamente si el estado cambió después del POST o si el POST expuso un estado inconsistente con el recurso guardado. La consulta confirma el estado final y corrige ambos escenarios. El PPTX de 6.1 MB es el contexto del intento, no una causa demostrada de este fallo.

### Corrección

- Los estados `requires_action`, `in_progress` y `queued` ahora provocan una consulta del mismo ID antes de decidir el resultado.
- Si la interacción sigue en proceso, se consulta a intervalos de un segundo, respetando el mismo AbortSignal y el presupuesto restante de cinco minutos. Las consultas no crean nuevas generaciones ni vuelven a subir el documento.
- Solo se valida y guarda una respuesta final `completed`. `incomplete`, `failed` y `cancelled` conservan su tratamiento como estados finales sin éxito; no se convierten artificialmente en éxito.
- Si la consulta confirma una función del cliente pendiente, se devuelve el código específico `TOOL_ACTION_REQUIRED`; no se ejecutan funciones indicadas por el modelo ni se fabrican resultados. La app configura únicamente Google Search como herramienta integrada.
- Se verifica que GET devuelva el mismo ID. Un fallo de consulta conserva la referencia y el snapshot disponible, sin atribuirle consumo final conocido a una interacción cuyo resultado quedó desconocido.
- El trace añade estado inicial, cantidad de consultas, estado final y tipos de pasos. La interfaz y el JSON descargado permiten identificar la transición. Los tokens corresponden al último resultado recuperado de esa interacción; consultar su estado no duplica la cuenta de generación.

### Validación

- Se ejecutó el nuevo reconciliador contra **la misma interacción real** usando el estado y el ID del diagnóstico original: una consulta, `completed`, JSON válido. La respuesta pasó `interactionResponse`, validación de citas web y `applyDocumentClassifications` con los metadatos originales de Scope; este último ejecuta también la validación de campos y evidencia. No se imprimieron documento, solicitud, consultas de búsqueda ni valores de las propuestas.
- 28 pruebas dirigidas aprobadas: cubren la regresión `requires_action → completed` con los conteos originales, Google Search, conservación del ID/contexto, una sola generación, tokens sin doble conteo, estados queued/in_progress, límite por AbortSignal, función del cliente pendiente, ID inesperado y error de consulta del proveedor.
- Tipos del servidor y chequeo dirigido del cliente: aprobados. ESLint dirigido: aprobado.
- No se ejecutaron build, suite completa ni navegador. La recuperación validada del recurso guardado no equivale a confirmar que la interfaz ya haya reemplazado el error del intento anterior.

## ERR-005 — Final review termina ante el primer HTTP 429 de Gemini — 2026-09-30

Estado: manejo corregido y validado con proveedor simulado; pendiente repetir la revisión real.

### Evidencia y causa

- Diagnóstico: `/Users/fredyrivas/Downloads/analysis-27f5f479-c5d7-4640-a89a-a162d0fd74d5.json`; request ID `27f5f479-c5d7-4640-a89a-a162d0fd74d5`.
- Inicio: `2026-09-30T19:17:04.657Z` (1:17:04 p.m. de Ciudad de México). Fase `final-review`, modelo `gemini-3.5-flash-lite`, LOW.
- Un intento de 11,227 ms; duración total 12,081 ms; plazo 300,000 ms. `PROVIDER_RATE_LIMIT`, etapa `provider`, origen `gemini`, HTTP remoto **429** y HTTP de la aplicación **503**. Tokens desconocidos.
- La solicitud incluía un documento retenido, sin volver a enviar sus bytes. El registro no identifica la cuota o capacidad concreta que originó el 429, ni demuestra un fallo del documento o del JSON.
- Las llamadas `create` desactivaban los reintentos del SDK (`maxRetries: 0`) y el catch propagaba inmediatamente el error. La recuperación existente atendía respuestas inválidas, no rechazos HTTP.

### Corrección y validación

- Ante un 429 explícito de `create`, hasta dos reintentos por análisis, con esperas de 2 y 4 segundos más hasta un segundo de variación aleatoria. Sigue la [recomendación de backoff de Google](https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429).
- Se conservan modelo, thinking, instrucciones y último checkpoint válido. Los reintentos por límite no consumen ni amplían la única recuperación de JSON/evidencia. Cada llamada queda registrada como intento; el consumo total permanece desconocido si alguna llamada no informa tokens.
- La espera y las llamadas comparten el AbortSignal y el plazo original; el job muestra `retrying` durante la espera. Si persiste el límite, se conserva `PROVIDER_RATE_LIMIT` con el HTTP original. Otros errores HTTP y las consultas de estado conservan su tratamiento existente.
- `node --test --test-reporter=spec server/brief-recovery.test.mjs`: **19 pruebas aprobadas**, incluidas recuperación de final review tras dos 429, límite persistente, recuperación de JSON entre rechazos y timeout durante la espera.
- ESLint dirigido a `server/brief-analysis.ts` y `git diff --check`: aprobados. Sin build, suite completa, servidor, navegador ni llamadas reales a Gemini.
