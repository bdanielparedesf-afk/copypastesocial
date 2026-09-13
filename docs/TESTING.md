# Testing manual guiado

## Preparación

1. Confirma en `.env.local`:
   - `MOCK_MODE=true`
   - `NEXT_PUBLIC_MOCK_MODE=true`
2. Reinicia el servidor de desarrollo para cargar las variables de entorno.
3. Conecta al menos cuatro cuentas sociales (Instagram, Facebook, TikTok y YouTube).
4. Abre `/content` y comprueba que el header muestra el badge amarillo `MOCK_MODE ACTIVO`.
5. En modo mock, cada job tarda 500 ms, no contacta APIs externas y recibe un `external_id` con prefijo `mock_`.

## Escenario 1×4

1. Selecciona exactamente **1 video**.
2. Selecciona las **4 cuentas** de destino.
3. Ejecuta **Fotocopiar Seleccionados**.
4. Abre `/publications` y localiza la publicación creada.
5. Verifica que tenga **4 jobs** y que los cuatro terminen con estado `SUCCESS`.
6. Abre el detalle y comprueba que cada job tenga un `external_id` con prefijo `mock_`.

## Escenario 10×4

1. Selecciona exactamente **10 videos**.
2. Selecciona las **4 cuentas** de destino.
3. Ejecuta **Fotocopiar Seleccionados**.
4. Verifica que el modal de progreso muestre **40 jobs**.
5. Comprueba que la cola procese los 40 jobs sin llamadas a APIs externas.
6. Abre `/publications` y confirma que la publicación registre 40 jobs y que avancen a `SUCCESS`.

## Escenario 50×4

1. Selecciona exactamente **50 videos**.
2. Selecciona las **4 cuentas** de destino.
3. Ejecuta **Fotocopiar Seleccionados**.
4. Verifica que la publicación y el modal soporten **200 jobs** sin caídas ni bloqueos de la interfaz.
5. Comprueba que la paginación y las actualizaciones realtime del modal sigan funcionando durante el procesamiento.
6. Confirma que la aplicación no exceda los límites de ejecución de Vercel y que los jobs finalicen en `SUCCESS`.
7. Abre `/publications` y valida el total de 200 jobs y sus estados finales.

## Criterios de aceptación

- `MOCK_MODE` evita llamadas a Instagram, Facebook, TikTok y YouTube.
- Cada job mock espera 500 ms y termina en `SUCCESS`.
- Los identificadores externos generados empiezan con `mock_`.
- Los escenarios 1×4, 10×4 y 50×4 producen 4, 40 y 200 jobs respectivamente.
- El modal de progreso, la paginación y `/publications` permanecen responsivos.
