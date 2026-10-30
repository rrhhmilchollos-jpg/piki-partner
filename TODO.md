# TODO · Piki Partner Orders Sunmi

## Pantalla PDA de dos fases
- [x] En terminal vertical Sunmi V2/V3, mostrar arriba el ID gigante, cliente, hora y alerta de alergias/notas especiales; mostrar en el centro productos, modificadores y estado del Rider; reservar la parte inferior para acciones táctiles grandes.
- [x] En pedido entrante, mostrar alarma continua compatible con la política de gesto de usuario y el selector `[15 min] [20 min] [30 min] [45 min]`, con 20 minutos por defecto.
- [x] Al pulsar «ACEPTAR PEDIDO», persistir el pedido como `accepted`, conservar el tiempo elegido para despacho, detener la alarma y enviar la comanda a impresión ESC/POS Sunmi con fallback web de 58 mm.
- [x] Tras aceptar, cambiar a la fase de preparación/recogida y mostrar «¡PEDIDO LISTO para recoger!» como acción primaria azul.
- [x] Al pulsar «¡PEDIDO LISTO para recoger!», persistir `ready_for_pickup`, notificar realtime y dejar que el backend coordine/reasigne el Rider según sus reglas.

## Backend y despacho
- [x] Aceptar y persistir tiempos de preparación 15, 20, 30 y 45 minutos sin romper transiciones existentes.
- [x] Mantener preparados los POST/PATCH y el cálculo Just-in-Time existente para que el tiempo de preparación participe en la selección del Rider.

## Calidad y entrega
- [x] Añadir pruebas del adaptador de impresión y validar las fases/payloads mediante el check y tests del API.
- [x] Ejecutar check, tests y build de Partner y API.
- [ ] Crear commits independientes en `piki-partner` y `piki-api`; dejar despliegue a Vercel/Render según la conexión de cada repositorio.
