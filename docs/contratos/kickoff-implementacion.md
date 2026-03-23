# KICK-OFF DE IMPLEMENTACIÓN
## MiRestconIA — dignita.tech
### Plan Enterprise

---

```
                    ╔══════════════════════════════════════════╗
                    ║    KICK-OFF DE IMPLEMENTACION             ║
                    ║  MiRestconIA — Plan Enterprise            ║
                    ║       5 Dias de Transformacion            ║
                    ╚══════════════════════════════════════════╝
```

---

**Cliente:** _______________________________________________

**Nombre del Restaurante:** _______________________________________________

**Ubicacion:** _______________________________________________

**Fecha de Inicio:** _____ de _______________ de 2026

**Fecha Estimada de Entrega:** _____ de _______________ de 2026

**Consultor Asignado:** _______________________________________________

**Telefono / WhatsApp del Consultor:** _______________________________________________

---

## INTRODUCCION

Este documento es la guia practica que usaremos durante la implementacion de MiRestconIA en su restaurante. Contiene todo lo que necesita saber para aprovechar al maximo los cinco (5) dias de trabajo.

**Objetivo:** Transformar sus operaciones para que funcionen de manera integral, ordenada y con inteligencia artificial desde el primer dia.

---

## CHECKLIST PRE-INSTALACION
### Lo que el cliente debe tener LISTO ANTES del Dia 1

IMPORTANTE: Algunos de estos items son criticos. Si no los tiene, la implementacion se retrasara.

### INFRAESTRUCTURA Y CONECTIVIDAD

- [ ] **Laptop o Mac disponible todo el tiempo**
  - Sera el servidor local en caso de perdida de internet.
  - Debe estar en el restaurante durante toda la semana.
  - Debe tener bateria o conexion electrica estable.

- [ ] **WiFi funcionando en el local**
  - Velocidad minima: 2 Mbps de descarga, 1 Mbps de subida.
  - Cobertura en toda el area de operacion (mesas, cocina, caja).
  - Prueba: todos los dispositivos (tablet, celular) conectados sin perdida de senal.

- [ ] **Dispositivos de prueba**
  - 2-3 smartphones o tablets (para mesas, cocina, caja).
  - Navegador web actualizado (Chrome, Safari o Edge).

### INFORMACION COMERCIAL Y LEGAL

- [ ] **Logo del restaurante en alta resolucion**
  - Formato: PNG o JPG (minimo 1000x1000 pixeles).
  - Fondo blanco o transparente preferiblemente.
  - Usaremos en tickets, comprobantes y sistema.

- [ ] **Nombre comercial exacto** (tal como aparece en los documentos)

- [ ] **Direccion completa del local**
  - Incluir: calle, numero, distrito, provincia, region.
  - Sera usada en facturas y comprobantes.

- [ ] **RUC del negocio** (para facturacion SUNAT)
  - Nota: Si no lo tiene pero tiene DNI, lo tramitamos durante la implementacion.

- [ ] **Clave SOL de SUNAT**
  - Usuario: _______________
  - Contraseña: _______________ (lo guardamos de forma segura)
  - Nota: No la comparta con nadie durante la implementacion.

- [ ] **Token de NubeFact** (o credenciales para crear cuenta)
  - Si ya tiene cuenta en NubeFact: Token de API disponible.
  - Si NO tiene: llevar DNI o RUC para registrarse (lo hacemos el Dia 1).
  - Costo: aproximadamente S/ 40-70/mes (no incluido en nuestra factura).

- [ ] **Numero de WhatsApp Business**
  - Numero de celular o linea empresarial para envio de facturas.
  - Debe estar activo durante toda la semana.

### INFORMACION DE PRODUCTOS Y MENU

- [ ] **Lista completa de platos del menu**
  - Formato: archivo Excel, Word, foto del menu impreso, o simplemente list escrita.
  - Incluir: nombre del plato, precio unitario, categorias (sopas, platos de fondo, etc.).
  - Ejemplo de estructura:
    ```
    Categoria: PLATOS DE FONDO
    - Lomo a lo Pobre: S/ 35.00
    - Ceviche: S/ 32.00
    - Aji de Gallina: S/ 28.00
    ```

- [ ] **Fotos de los platos** (minimo los principales)
  - Cantidad: al menos 40-50 fotos (pero cuanto mas, mejor).
  - Tamaño: minimo 800x600 pixeles (fotos con celular esta bien).
  - Formato: JPG o PNG.
  - Organizacion: preferiblemente en una carpeta o por categorias.
  - Nota: Si no tiene fotos, la implementacion puede continuar con imagenes genericas y actualizarlas despues.

- [ ] **Listado de categorias de productos**
  - Ejemplo: Sopas, Platos de Fondo, Bebidas Calientes, Bebidas Frias, Postres, Extras (arroz, papa, ensalada aparte).
  - Ayudara a organizar el catalogo visual para los mozos.

- [ ] **Variantes de productos** (si aplica)
  - Ejemplo: tamaños de bebidas (pequeno, mediano, grande).
  - Guarniciones adicionales (arroz, papa, yuca, camote).
  - Preparaciones especiales (punto de la carne, picante, dulce).

### INFORMACION DE MESAS

- [ ] **Distribucion de mesas del restaurante**
  - Cantidad total de mesas: ___
  - Detallar por zona:
    ```
    ZONA 1 — SALON PRINCIPAL
    Mesa 1, Mesa 2, Mesa 3, Mesa 4 (mesas para 2 personas)
    Mesa 5, Mesa 6, Mesa 7 (mesas para 4 personas)
    Mesa 8 (mesa para 6 personas)

    ZONA 2 — TERRAZA
    Mesa 9, Mesa 10, Mesa 11 (mesas para 4 personas)

    ZONA 3 — BARRA
    Asientos 1-6

    ZONA 4 — SALON PRIVADO
    Mesa 12 (mesa para 8 personas)
    ```

- [ ] **Nombres y numeros de mesas exactos**
  - El sistema usara estos numeros para identificar pedidos.

### INFORMACION DE INVENTARIO

- [ ] **Listado de ingredientes / insumos del almacen**
  - Incluir: nombre, unidad de medida (kg, litros, unidades), cantidad actual, stock minimo sugerido.
  - Ejemplo:
    ```
    CARNES
    - Res (kg): 15 kg disponibles, minimo 10 kg
    - Pollo (kg): 20 kg disponibles, minimo 15 kg
    - Pescado (kg): 8 kg disponibles, minimo 5 kg

    VEGETALES
    - Papa (kg): 50 kg disponibles, minimo 30 kg
    - Cebolla (kg): 12 kg disponibles, minimo 8 kg
    ```

- [ ] **Recetas de los platos principales**
  - Para cada plato incluir: ingredientes y cantidades.
  - Ejemplo:
    ```
    LOMO A LO POBRE
    - Lomo de res: 200 g
    - Papa frita: 150 g
    - Cebolla morada (fileteada): 50 g
    - Huevo frito: 1 unidad
    - Salsa criolla: 50 ml
    ```
  - Nota: No es necesario para todos, pero si para los principales.

- [ ] **Informacion de proveedores**
  - Nombre del proveedor, producto que suministra, contacto, condiciones de pago.
  - Sera util para generar ordenes de compra desde el sistema.

### INFORMACION DE PERSONAL

- [ ] **Lista de empleados que usaran el sistema**
  - Nombre completo, rol (mesero, cocinero, cajero, almacenero, administrador).
  - Usuario deseado (nombre de usuario), contraseña temporal.
  - Ejemplo:
    ```
    - Juan Perez Gomez | Mesero | usuario: jperez | contraseña: Juan123
    - Maria Garcia Lopez | Cajero | usuario: mgarcia | contraseña: Maria456
    ```

- [ ] **Definicion de roles en el personal**
  - Quien sera el administrador principal (dueno o gerente).
  - Cuantos mozos/meseros.
  - Cuantos en cocina.
  - Cuantos en caja.
  - Si hay personal de almacen.

### EQUIPOS E IMPRESORAS

- [ ] **Impresora termica para tickets**
  - Modelo: _____________________
  - Conexion: USB / Red / Bluetooth
  - Tamaño de papel: 58mm o 80mm (verificar en el rollo actual).
  - Debe estar conectada y funcionando.

- [ ] **Monitor de cocina** (opcional pero recomendado)
  - Si desea que los cocineros vean los pedidos en una pantalla, traer monitor/TV conectado.

- [ ] **Otros equipos**
  - Lector de codigos de barras (si aplica): ___
  - Lectores de tarjeta de credito (si aplica): ___
  - Scanner: ___

### INFORMACION DE METODOS DE PAGO

- [ ] **Metodos de pago que acepta el restaurante**
  - [ ] Efectivo
  - [ ] Tarjeta de credito / debito
  - [ ] Yape
  - [ ] Plin
  - [ ] Transferencia bancaria
  - [ ] Otros: _____________________

- [ ] **Datos bancarios del restaurante** (para recibir transferencias)
  - Banco: _____________________
  - Numero de cuenta: _____________________
  - Titular: _____________________

---

## DIA 1: INSTALACION Y CONFIGURACION BASE
### Duracion: 4 horas

**Horario:** 09:00 - 13:00

**Objetivo:** Sistema instalado en la nube, datos basicos del restaurante configurados, SUNAT conectado, WhatsApp funcionando.

### AGENDA DETALLADA

#### 09:00 - 10:00 | PRESENTACION Y DEMOSTRACION (1 hora)

**Que haremos:**
- Bienvenida y explicacion general de MiRestconIA.
- Demostracion de los 5 modulos principales (mesas, cocina, caja, almacen, reportes).
- Mostramos como fluye un pedido: desde mesa → cocina → caja → factura.
- Presentamos DalIA, el asistente inteligente.
- Explicamos el plan de los proximos 5 dias.

**Participantes:** Dueno, gerente general, personal clave.

**Entregables:**
- [ ] Todos entienden como funciona el sistema.

---

#### 10:00 - 11:00 | CONFIGURACION BASE (1 hora)

**Que haremos:**
- Crear la cuenta de Administrador principal con su usuario y contraseña.
- Cargar logo, nombre comercial, direccion, foto del restaurante.
- Configurar moneda (PEN), impuesto IGV (18%), zona horaria (UTC-5 Lima).
- Elegir formato de impresion: ancho de papel para tickets (58mm o 80mm).
- Configurar pie de pagina personalizado en los tickets.
- Prueba de acceso desde multiples dispositivos.

**Participantes:** Consultor + Administrador del sistema (dueno/gerente).

**Entregables:**
- [ ] Cuenta administrativa creada.
- [ ] Logo visible en el sistema.
- [ ] Configuracion regional correcta.
- [ ] Acceso verificado desde laptop, tablet, celular.

---

#### 11:00 - 12:00 | CONEXION SUNAT (1 hora)

**Que haremos:**
- Crear o usar cuenta existente en NubeFact (Operador de Servicios Electronicos).
- Registrar RUC del restaurante en el sistema.
- Obtener y cargar el token de NubeFact en MiRestconIA.
- Configurar serie y correlativo de boletas (ej: B001, B002, ...).
- Configurar serie y correlativo de facturas (ej: F001, F002, ...).
- Emitir una boleta de prueba para verificar la conexion.
- Verificar que la boleta llega correctamente a SUNAT.

**Participantes:** Consultor + Administrador.

**Importante:** Si el cliente NO tiene RUC aun, usamos su DNI temporalmente y luego activamos el RUC. Si NO tiene Clave SOL, la creamos durante este proceso.

**Entregables:**
- [ ] NubeFact conectado al sistema.
- [ ] Primera boleta de prueba emitida y validada en SUNAT.
- [ ] Token guardado de forma segura.
- [ ] Cajero comprende como se emiten boletas/facturas.

---

#### 12:00 - 13:00 | CONFIGURACION WHATSAPP (1 hora)

**Que haremos:**
- Registrar numero de WhatsApp Business en Meta Business Manager (si no esta).
- Obtener el token de acceso a Meta Cloud API.
- Cargar el token en MiRestconIA.
- Configurar numero de WhatsApp en la sección de notificaciones.
- Hacer prueba: enviar un comprobante de prueba por WhatsApp.
- Verificar que el mensaje llega correctamente al celular designado.

**Participantes:** Consultor + Administrador.

**Nota:** El costo de mensajes por WhatsApp (aprox S/ 0.05 por comprobante) se cobra como parte del servicio anual.

**Entregables:**
- [ ] WhatsApp Business conectado.
- [ ] Mensaje de prueba enviado y recibido.
- [ ] Administrador sabe como configurar numero de cliente para WhatsApp.

---

### RESUMEN DIA 1

**Verificacion final:**

- [ ] Sistema accesible desde: navegador web, tablet, smartphone.
- [ ] Logo del restaurante visible en todos los comprobantes.
- [ ] SUNAT respondiendo correctamente a emisiones de prueba.
- [ ] WhatsApp enviando comprobantes.
- [ ] Todos en el equipo han accedido al sistema al menos una vez.

**Firma de avance:** Consultor y Cliente confirman que el Dia 1 se completo exitosamente.

Consultor: ________________________     Cliente: ________________________

---

## DIA 2: CARGA DE DATOS
### Duracion: 6 horas

**Horario:** 09:00 - 15:00 (con descanso de 12:00 - 13:00)

**Objetivo:** Menu completo cargado con fotos, mesas configuradas, inventario listo, recetas vinculadas.

### AGENDA DETALLADA

#### 09:00 - 11:00 | CARGA DEL MENU - PRODUCTOS Y CATEGORIAS (2 horas)

**Que haremos:**
- Crear categorias principales del menu: Sopas, Platos de Fondo, Bebidas Calientes, Bebidas Frias, Postres, Extras.
- Por cada producto, cargar:
  - Nombre exacto del plato.
  - Precio unitario.
  - Categoria.
  - Descripcion breve (opcional, pero recomendado).
  - Foto de alta calidad.
  - Disponibilidad (si aplica, marcar platos que se sirven solo ciertos dias).
- Configurar variantes si existen (ej: tamaños de bebidas, puntos de carne).
- Verificar que el menu se ve correcto en la vista de mesero (catalogo visual).

**Participantes:** Consultor + Administrador + Persona del restaurante que conoce los productos (dueno, cocinero o chef).

**Trabajo preparatorio:**
- Tener el menu en formato digital o impreso frente a nosotros.
- Tener fotos organizadas por categoria.
- Aclarar precios de cada plato y variantes.

**Entregables:**
- [ ] Al menos 30-50 productos cargados.
- [ ] Cada producto con foto.
- [ ] Categorias organizadas.
- [ ] Vista de mesero muestra el menu correctamente.
- [ ] Todos los precios verificados.

**Nota:** Si no tiene fotos para todos los platos, usamos imagenes genericas y las reemplazamos despues.

---

#### 11:00 - 12:00 | CONFIGURACION DE MESAS (1 hora)

**Que haremos:**
- Crear todas las mesas del restaurante en el sistema.
- Organizar mesas por zonas (Salon Principal, Terraza, Barra, Salon Privado, etc.).
- Asignar numero a cada mesa (siguiendo su numeracion actual).
- Configurar capacidad de cada mesa (numero de comensales).
- Definir estado inicial de cada mesa (libre).
- Ver el mapa de mesas desde la vista de mesero.
- Probar cambiar estado de una mesa (de libre a ocupada y viceversa).

**Participantes:** Consultor + Administrador + Responsable de mesas.

**Trabajo preparatorio:**
- Saber el numero exacto de mesas.
- Tener el plano o distribucion del restaurante.
- Saber que zonas tiene el restaurante.

**Entregables:**
- [ ] Todas las mesas creadas en el sistema.
- [ ] Mesas organizadas por zonas.
- [ ] Numeros asignados correctamente.
- [ ] Vista de mesas se ve clara e intuitiva.

---

#### 12:00 - 13:00 | DESCANSO

---

#### 13:00 - 14:30 | CARGA DE INVENTARIO (1.5 horas)

**Que haremos:**
- Crear categorias de ingredientes (Carnes, Vegetales, Condimentos, Bebidas, Lacteos, etc.).
- Cargar cada ingrediente con:
  - Nombre exacto.
  - Unidad de medida (kg, litros, unidades, etc.).
  - Stock actual (cantidad que tiene ahora).
  - Stock minimo (cantidad a partir de la cual alertar).
  - Fecha de vencimiento (si aplica).
  - Proveedor.
- Cargar informacion de proveedores principales.
- Verificar que el sistema calcula alertas de stock bajo.
- Validar que todos los ingredientes criticos estan registrados.

**Participantes:** Consultor + Administrador + Encargado de almacen o cocina.

**Trabajo preparatorio:**
- Tener inventario actual del almacen realizado (cuanto hay de cada cosa).
- Saber que es stock minimo para cada ingrediente (cuando pedir mas).
- Tener contactos de proveedores.

**Entregables:**
- [ ] Al menos 80-100 ingredientes cargados.
- [ ] Stock actual verificado (consultando almacen).
- [ ] Stock minimo configurado.
- [ ] Proveedores registrados.
- [ ] Alertas de stock bajo funcionando.

---

#### 14:30 - 15:00 | RECETAS Y VINCULACION (30 minutos)

**Que haremos:**
- Para los platos principales, vincular ingredientes con productos del menu.
- Ejemplo: Lomo a lo Pobre = 200g de res + 150g de papa frita + huevo + cebolla + salsa.
- El sistema calculara el costo de produccion de cada plato.
- El sistema alertara sobre disponibilidad si falta algun ingrediente.

**Participantes:** Consultor + Administrador + Chef o Cocinero.

**Nota:** No es obligatorio hacer todas las recetas el Dia 2. Las mas importantes primera, luego completar en los dias siguientes.

**Entregables:**
- [ ] Recetas de platos principales creadas.
- [ ] Costos de produccion calculados.
- [ ] Sistema alerta si falta ingrediente para un plato.

---

### RESUMEN DIA 2

**Verificacion final:**

- [ ] Menu 100% cargado con fotos y precios.
- [ ] Mesas configuradas y visibles.
- [ ] Inventario cargado con stock actual.
- [ ] Recetas principales vinculadas.
- [ ] Sistema muestra alertas de stock bajo.

**Firma de avance:** Consultor y Cliente confirman que el Dia 2 se completo exitosamente.

Consultor: ________________________     Cliente: ________________________

---

## DIA 3: PERSONAL Y OPERACIONES
### Duracion: 4 horas

**Horario:** 09:00 - 13:00

**Objetivo:** Personal creado, caja configurada, servidor local instalado, flujo completo probado.

### AGENDA DETALLADA

#### 09:00 - 10:00 | CREACION DE USUARIOS POR ROL (1 hora)

**Que haremos:**
- Crear cuenta para cada empleado del restaurante segun su rol.
- Roles disponibles: Administrador, Mesero, Cocinero, Cajero, Almacenero.
- Por cada usuario, configurar:
  - Nombre completo.
  - Nombre de usuario (username).
  - Contraseña temporal (que cambien en primer login).
  - Rol asignado.
- Hacer que cada usuario pruebe su acceso (login y logout).
- Mostrar a cada usuario el dashboard personalizado para su rol.

**Participantes:** Consultor + Administrador + Todo el personal.

**Trabajo preparatorio:**
- Tener lista de empleados con sus nombres, roles.
- Decidir usernames para cada uno (ej: jperez para Juan Perez).

**Entregables:**
- [ ] Todos los empleados tienen acceso al sistema.
- [ ] Cada uno ve su dashboard correspondiente a su rol.
- [ ] Contraseñas temporales funcionando.
- [ ] Personal conoce su usuario y contraseña.

---

#### 10:00 - 11:00 | CONFIGURACION DE METODOS DE PAGO (1 hora)

**Que haremos:**
- Activar los metodos de pago que acepta el restaurante:
  - Efectivo.
  - Tarjeta de credito/debito.
  - Yape.
  - Plin.
  - Transferencia bancaria.
- Configurar la caja: moneda (PEN), persona responsable, horario de apertura/cierre.
- Establecer el monto inicial de caja (la cantidad de efectivo con la que se abre cada dia).
- Probar una transaccion de prueba: efectivo, tarjeta y metodo mixto.

**Participantes:** Consultor + Administrador + Cajero.

**Entregables:**
- [ ] Metodos de pago habilitados.
- [ ] Caja configurada.
- [ ] Cajero entiende como procesar pagos.
- [ ] Transacciones de prueba funcionan.

---

#### 11:00 - 12:00 | INSTALACION DE SERVIDOR LOCAL (1 hora)

**Que haremos:**
- Instalar PostgreSQL en la laptop/Mac que sera el servidor local.
- Sincronizar la base de datos de la nube al servidor local.
- Configurar el modo offline: el sistema funciona sin internet usando el servidor local.
- Hacer una prueba de pedido sin internet.
- Verificar que cuando hay internet de nuevo, los datos se sincronizan automaticamente.

**Participantes:** Consultor + Administrador (persona mas tecnica si es posible).

**Importancia:** Este paso es critico. Garantiza que si se cae internet, el restaurante puede seguir operando.

**Entregables:**
- [ ] PostgreSQL instalado en laptop/Mac.
- [ ] Servidor local sincronizado.
- [ ] Modo offline probado.
- [ ] Sincronizacion automatica funcionando.
- [ ] Administrador sabe como cambiar del servidor local al servidor en la nube manualmente.

---

#### 12:00 - 13:00 | PRUEBA DE FLUJO COMPLETO (1 hora)

**Que haremos:**
- Simular un dia completo de operacion:
  1. **Apertura de caja:** Cajero abre la caja con monto inicial.
  2. **Toma de pedido:** Mesero abre una mesa, toma un pedido del menu, lo envía a cocina.
  3. **Preparación en cocina:** Cocinero ve el pedido en la cola, marca como "preparando", luego "listo".
  4. **Servicio:** Mesero ve que esta listo, lo sirve.
  5. **Cobro:** Mesero llama al cajero, quien procesa el pago (efectivo o tarjeta).
  6. **Facturacion:** Sistema emite boleta electronica automaticamente.
  7. **Comprobante por WhatsApp:** Boleta se envía al cliente por WhatsApp.
  8. **Cierre:** Al final del turno, cajero cierra caja y ve el resumen de ventas.

**Participantes:** Consultor + Todos los roles (administrador, meseros, cocinero, cajero, almacenero).

**Duracion:** 60 minutos de operacion simulada.

**Entregables:**
- [ ] Flujo completo funcionando sin errores.
- [ ] Todos entienden su parte del proceso.
- [ ] Comprobante generado correctamente.
- [ ] WhatsApp entrega comprobante.
- [ ] Cajero cierra caja sin problemas.

---

### RESUMEN DIA 3

**Verificacion final:**

- [ ] Todos los empleados tienen acceso al sistema.
- [ ] Metodos de pago funcionan.
- [ ] Servidor local instalado y probado.
- [ ] Flujo completo operativo: pedido → cocina → caja → factura → WhatsApp.

**Firma de avance:** Consultor y Cliente confirman que el Dia 3 se completo exitosamente.

Consultor: ________________________     Cliente: ________________________

---

## DIA 4: CAPACITACION COMPLETA
### Duracion: 6 horas

**Horario:** 09:00 - 15:00 (con descanso de 12:30 - 13:30)

**Objetivo:** Todo el personal capacitado, manual entregado, equipo listo para go-live.

### AGENDA DETALLADA

#### 09:00 - 11:00 | CAPACITACION ADMINISTRADOR (2 horas)

**Dirigido a:** Dueno, Gerente General, Responsable administrativo.

**Temas:**

**1. Dashboard Ejecutivo (30 min)**
- KPIs principales: ventas del dia, semana, mes.
- Graficos de tendencias.
- Comparativa con periodos anteriores.
- Alertas automaticas.
- DalIA: como consultar al asistente, que preguntas hacer.

**2. Reportes y Analisis (30 min)**
- Reporte de ventas por dia, semana, mes.
- Reporte de productos mas vendidos.
- Reporte de metodos de pago.
- Reporte de ocupacion de mesas.
- Exportacion a PDF y Excel.
- Lectura e interpretacion de reportes.

**3. Gestion de Inventario (20 min)**
- Como ver stock actual de ingredientes.
- Como registrar nuevas entradas de mercaderia.
- Como registrar mermas y desperdicios.
- Alertas de stock bajo.
- Alertas de productos proximos a vencer.

**4. Facturacion SUNAT y WhatsApp (20 min)**
- Como emitir boletas y facturas manualmente si es necesario.
- Como ver historial de comprobantes emitidos.
- Como reenviar comprobante a SUNAT.
- Como enviar comprobante por WhatsApp.
- Que hacer si se rechaza un comprobante.

**5. Administracion Financiera (20 min)**
- Estado de resultados simplificado (ingresos vs gastos).
- Registro de gastos del negocio.
- Control de nomina (registro de sueldos pagados).
- Dashboard financiero mensual.
- Lecturas con DalIA.

**6. Seguridad y Backups (10 min)**
- Como cambiar contraseña de usuarios.
- Como desactivar una cuenta (si un empleado se va).
- Backups automaticos (cada dia).
- Como exportar todos los datos en caso de emergencia.
- Politica de proteccion de datos personales.

**Entregables:**
- [ ] Administrador entiende todos los reportes.
- [ ] DalIA consultado exitosamente.
- [ ] Administrador puede gestionar usuarios.
- [ ] Sabe hacer backup de los datos.

---

#### 11:00 - 12:00 | CAPACITACION MESERO (1 hora)

**Dirigido a:** Meseros, personal de sala.

**Temas:**

**1. Login y Dashboard Personal (10 min)**
- Como ingresar al sistema.
- Que ve en el dashboard: mesas asignadas, pedidos activos, sugerencias de DalIA.
- Como cambiar contraseña.

**2. Vista de Mesas (10 min)**
- Donde ver todas las mesas del restaurante.
- Como saber el estado de una mesa (libre, ocupada, con pedido en cocina, lista para cobrar).
- Como abrir una mesa nueva para un nuevo cliente.
- Como continuar un pedido si el cliente pide mas.

**3. Toma de Pedidos (25 min)**
- Como ingresar a una mesa para tomar pedido.
- Uso del catalogo visual: fotos, nombres, precios, categorias.
- Como buscar un producto (buscar por nombre).
- Como agregar producto al pedido (cantidad, notas especiales).
- Ejemplo: cliente quiere pollo sin ají, hacemos nota "SIN AJI".
- Como ver el total del pedido en tiempo real.
- Como corregir un producto antes de enviar.

**4. Envio a Cocina (10 min)**
- Como enviar el pedido a la cola de cocina.
- Como ver el estado del pedido: pendiente, preparando, listo para servir.
- Si el cliente quiere algo mas: como agregar items sin perder el pedido anterior.
- Que hacer si cocina dice que falta un ingrediente (coordinarse).

**5. Consulta de Productos (5 min)**
- Como ver informacion de un producto (ingredientes, preparacion especial).
- Como responder preguntas del cliente sobre los platos.

**Practica en vivo:**
- Cada mesero toma 2-3 pedidos de prueba.
- Envian a cocina.
- Ven como aparece en la cola de cocina.

**Entregables:**
- [ ] Cada mesero ha tomado al menos 1 pedido exitosamente.
- [ ] Saben usar el catalogo visual.
- [ ] Pueden enviar a cocina.
- [ ] Entienden los estados del pedido.

---

#### 12:00 - 12:30 | CAPACITACION COCINA (30 minutos)

**Dirigido a:** Cocinero(s), personal de cocina.

**Temas:**

**1. Login y Acceso (5 min)**
- Como ingresar al sistema.
- Que ve el cocinero: unicamente la cola de cocina.
- Acceso restringido a otras funciones (sin ver dinero, ventas, etc.).

**2. Cola de Cocina (10 min)**
- Vista de todos los pedidos enviados desde mesas.
- Orden cronologico: primero en llegar, primero en atender.
- Tiempo transcurrido desde que se envio cada pedido (en rojo si es muy antiguo).
- Alertas visuales y sonoras cuando llega un nuevo pedido.

**3. Estados de Preparacion (10 min)**
- Cambiar estado de un pedido:
  1. **Enviado:** El mesero acaba de enviar. Estado inicial.
  2. **Preparando:** Estamos cocinando.
  3. **Listo para servir:** El plato esta listo. Mesero lo sirve.
  4. **Servido:** El cliente ya lo comio. El pedido cierra (opcional).
- Como hacer cambios de estado: seleccionar pedido y hacer clic en el nuevo estado.

**4. Notas Especiales (5 min)**
- El cocinero VE las notas que el mesero escribio (ej: "SIN AJI", "MUY PICANTE", "PUNTO ROJO").
- Importancia de leer las notas.
- Si hay duda, coordinarse con el mesero antes de cocinar.

**Practica en vivo:**
- Usamos los pedidos de prueba que enviaron los meseros.
- Cocinero cambia estados: enviado → preparando → listo.
- Ve como el mesero notificado cuando esta listo.

**Entregables:**
- [ ] Cocinero entiende los estados.
- [ ] Maneja la cola de cocina sin problemas.
- [ ] Lee las notas especiales.

---

#### 12:30 - 13:30 | DESCANSO

---

#### 13:30 - 14:30 | CAPACITACION CAJERO (1 hora)

**Dirigido a:** Personal de caja, responsable de facturacion.

**Temas:**

**1. Login y Dashboard de Caja (10 min)**
- Como ingresar al sistema.
- Dashboard personal: ventas del dia, numero de facturas, metodos de pago.
- Estado actual de la caja (abierta/cerrada, monto acumulado).
- Alertas de DalIA sobre caja.

**2. Apertura de Caja (10 min)**
- Como abrir la caja al inicio del turno/dia.
- Registrar el monto inicial en efectivo (ej: S/ 200.00).
- El sistema guarda la hora de apertura.
- Datos del responsable de la caja.

**3. Procesamiento de Pagos (25 min)**
- El mesero trae el resumen de la mesa al cajero.
- Cajero selecciona la mesa en el sistema.
- Ve el total a cobrar.
- Elige el metodo de pago:
  - **Efectivo:** Cajero recibe dinero. Sistema calcula vuelto. Imprime ticket con el cambio.
  - **Tarjeta:** Cajero procesa en la terminal. Sistema registra transaccion.
  - **Yape/Plin:** Cliente escanea QR. Sistema recibe confirmacion.
  - **Mixto:** Ej: efectivo + tarjeta. Sistema divide el monto.
- Especificar si es boleta (anonima) o factura (con RUC/DNI del cliente).
- Sistema emite comprobante electronico automaticamente.
- Comprobante se imprime y se envía por WhatsApp (si cliente proporciona numero).

**4. Genera Comprobante SUNAT (10 min)**
- Boleta: emision automatica, rapida.
- Factura: requiere RUC del cliente. Buscarlo en la lista o crear uno nuevo.
- QR en el comprobante: cliente puede verificar en SUNAT.
- Que hacer si SUNAT rechaza el comprobante (raro, pero podra consultar).
- Impresion: se imprime ticket de 80mm.

**5. Cierre de Caja (10 min)**
- Al final del turno/dia: opcion "Cerrar Caja".
- Sistema muestra: monto inicial, dinero recibido por venta, egresos manuales, total esperado.
- Cajero cuenta el dinero en caja.
- Sistema hace arqueo por metodo de pago.
- Si hay diferencia pequena, se registra como "Diferencia de caja" (en rojo o naranja).
- Se imprime reporte de cierre.
- Cajero firma reporte.

**Practica en vivo:**
- Cada cajero abre una caja de prueba.
- Procesa 3-5 pagos de prueba (efectivo, tarjeta, mixto).
- Emite boleta y factura.
- Cierra la caja.
- Ve el resumen.

**Entregables:**
- [ ] Cajero abre caja correctamente.
- [ ] Procesa todos los tipos de pago.
- [ ] Emite boleta y factura.
- [ ] Cierra caja sin errores.
- [ ] Lee el reporte de cierre.

---

#### 14:30 - 15:00 | CAPACITACION ALMACENERO (30 minutos)

**Dirigido a:** Personal de almacen (si aplica).

**Temas:**

**1. Login y Dashboard de Almacen (5 min)**
- Como ingresar al sistema.
- Dashboard: resumen del inventario, alertas criticas, ultimas entradas.
- DalIA: "¿Que insumos tengo que pedir esta semana?" → DalIA responde.

**2. Gestion de Stock (15 min)**
- Como ver el inventario completo.
- Buscar un ingrediente especifico.
- Ver stock actual, minimo, fecha de vencimiento.
- Registrar una entrada de mercaderia: fecha, cantidad, numero de lote, proveedor.
- Registrar una merma (ej: vencimiento, rotura): cantidad perdida, motivo.
- Ajustes de inventario si hay discrepancia entre el sistema y la realidad fisica.

**3. Alertas de Stock Bajo (5 min)**
- Donde estan las alertas en el dashboard.
- Que significan (ingrediente bajo minimo).
- Como responder: generar una orden de compra (manual o con DalIA).
- Comunicar a administrador que hay que pedir.

**4. Control de Vencimiento (5 min)**
- Ver fechas de vencimiento de cada lote.
- Alertas de productos proximos a vencer (configurable a 7, 14 o 30 dias).
- Uso FIFO: consumir primero los que vencen mas pronto.

**Entregables:**
- [ ] Almacenero ve el inventario completo.
- [ ] Sabe registrar entradas y mermas.
- [ ] Entiende alertas de stock bajo.
- [ ] Sabe hacer seguimiento de vencimiento.

---

### RESUMEN DIA 4

**Verificacion final:**

- [ ] Todos capacitados en sus roles.
- [ ] Cada persona puede operar su dashboard.
- [ ] Todos han hecho una prueba operativa completa.
- [ ] Manuales de usuario entregados (impreso o PDF).
- [ ] Listado de contactos para soporte disponible.

**Entregables del Dia 4:**
- Certificado de Asistencia para cada participante (opcional).
- Manual de Usuario impreso o en PDF.
- Accesos y contraseñas documentados en forma segura (entregados en sobre cerrado).
- Video tutorial grabado del proceso (enviado por email).

---

## DIA 5: GO-LIVE Y SUPERVISION
### Duracion: Jornada completa (9:00 - 17:00 con descanso)

**Objetivo:** Restaurante operando con MiRestconIA. Consultor presente observando, corrigiendo y apoyando. Firma del Acta de Entrega.

### AGENDA

#### 09:00 - 09:30 | PREPARACION Y APERTURA OFICIAL (30 minutos)

**Que haremos:**
- Revisar que todos esten presentes y listos.
- Encender sistemas: laptop (servidor local), impresora, dispositivos de meseros, cocina.
- Verificar que la WiFi funciona correctamente.
- Abrir navegador web y acceder al sistema desde todos los dispositivos.
- Hacer prueba rapida de login con cada usuario.

**Participantes:** Todos.

**Entregables:**
- [ ] Sistemas encendidos y accesibles.
- [ ] Todos pueden acceder.

---

#### 09:30 - 17:00 | OPERACION EN VIVO CON SUPERVISION (jornada laboral completa)

**Que haremos:**
El consultor estara presente o disponible por acceso remoto observando en tiempo real:

1. **Meseros toman pedidos** → Consultor verifica que el flujo es correcto. Si hay duda, asesora.
2. **Cocinero recibe pedidos** → Consultor revisa que la cola funciona, estados cambian correctamente.
3. **Cajero cobra** → Consultor verifica emision de comprobante, cambio calculado correctamente.
4. **Comprobante por WhatsApp** → Consultor confirma que llega correctamente.
5. **Cierre de caja** → Al final del turno, cajero cierra. Consultor revisa el reporte.
6. **Reportes** → Administrador genera un reporte del dia. Consultor valida numeros.

**Rol del Consultor:**
- Observar (no intervenir a menos que sea critico).
- Notar errores o dudas y corregir en vivo.
- Responder preguntas del personal.
- Ajustar configuraciones si es necesario (precios, fotos, mesas).
- Registrar en un documento cualquier incidencia y su solucion.

**Rol del Cliente:**
- Operar el sistema normalmente como un dia cualquiera.
- Resolver problemas comunes (clientes insatisfechos, pedidos especiales, etc.).
- Comunicar al consultor si algo no funciona como lo esperado.

**Descansos:**
- 12:00 - 13:00: Descanso de almuerzo (los empleados comen, el consultor se queda disponible).
- 14:00 - 14:30: Descanso breve.

---

#### 17:00 - 17:30 | REVISION FINAL Y AJUSTES (30 minutos)

**Que haremos:**
- Revisar los numeros del dia: ventas totales, numero de transacciones, monto en caja.
- Ver que todo coincida: dinero en caja = total de ventas en el dia.
- Generar reporte final del dia.
- Hacer lista de ajustes pendientes para los proximos dias:
  - Fotos de productos que faltan.
  - Precios que hay que cambiar.
  - Mesas que hay que reconfigurar.
  - Capacitacion adicional para algun empleado.

**Entregables:**
- [ ] Dia operativo completado sin errores criticos.
- [ ] Numeros del dia conciliados.
- [ ] Lista de mejoras a realizar en los proximos dias.

---

#### 17:30 - 18:00 | FIRMA DEL ACTA DE ENTREGA (30 minutos)

**Que haremos:**
- Ambas partes (consultor y cliente) revisan el formulario de Acta de Entrega.
- Se confirma que:
  - [ ] Sistema instalado y funcionando.
  - [ ] Menu completo cargado.
  - [ ] Mesas configuradas.
  - [ ] Inventario cargado.
  - [ ] SUNAT conectado.
  - [ ] WhatsApp configurado.
  - [ ] Personal capacitado.
  - [ ] Servidor local operativo.
  - [ ] Se realizo una jornada laboral completa exitosamente.

- Se firma el Acta en DOS copias: una para dignita.tech, una para el Cliente.
- Se fotografian las firmas como respaldo.
- Se explica el siguiente paso: **Soporte Prioritario de 30 dias**.

---

### RESUMEN DIA 5

**Checklist final:**

- [ ] Sistema completamente operativo.
- [ ] Personal confiado en el manejo.
- [ ] Acta de Entrega firmada.
- [ ] Soporte prioritario activado (comienza hoy, termina 30 dias despues).
- [ ] Contactos de soporte entregados.
- [ ] Contraseñas y accesos documentados de forma segura.

**Firma de conformidad:**

```
ACTA DE CONFORMIDAD DE IMPLEMENTACION

Fecha: _____ de _______________ de 2026

Cliente: _________________________________
Restaurante: _________________________________
Ubicacion: _________________________________

El cliente confirma que:

[ ] El sistema esta instalado y funcionando
[ ] El menu esta cargado completo
[ ] Las mesas estan configuradas
[ ] El inventario esta cargado
[ ] SUNAT esta conectado
[ ] WhatsApp esta configurado
[ ] El personal fue capacitado
[ ] El servidor local esta operativo
[ ] Se realizo una operacion real completa

Observaciones y mejoras pendientes:
_________________________________________________
_________________________________________________
_________________________________________________

Consultor:                          Cliente:

_______________________            _______________________
Firma                              Firma

_______________________            _______________________
Nombre                             Nombre

_______________________            _______________________
DNI                                DNI / RUC

_______________________            _______________________
Fecha                              Fecha
```

---

## SOPORTE POST-IMPLEMENTACION
### Periodo de 30 Dias — PRIORITARIO

**Comienza:** El dia que se firma el Acta de Entrega.
**Termina:** 30 dias calendario despues.

### CARACTERISTICAS DEL SOPORTE PRIORITARIO

**Canal de comunicacion:**
- WhatsApp del consultor asignado (numero entregado en el Acta).
- Acceso remoto si es necesario para diagnosticar problemas.

**Horario:**
- Lunes a Sabado: 08:00 - 20:00 (hora de Lima).
- Domingos: Soporte limitado para emergencias criticas.

**Tiempo de respuesta:**
- **Problema critico** (ej: sistema caido, no se puede cobrar): Respuesta en menos de 2 horas. Incluye fin de semana.
- **Problema normal** (ej: un producto no aparece, foto no se ve): Respuesta en menos de 4 horas.
- **Consulta o duda:** Respuesta en menos de 24 horas.

**Que incluye el soporte prioritario:**
- Resolucion de bugs o errores en el sistema.
- Ajustes de configuracion (precios, fotos, mesas).
- Capacitacion adicional para nuevo personal.
- Migracion de datos adicionales si es necesario.
- Asesoria operativa: "¿Como hago X?" → Se muestra el paso a paso.
- Optimizacion: "El sistema es lento" → Se investiga y mejora.

**Que NO incluye el soporte prioritario:**
- Entrenamiento completo de nuevo empleado (primera sesion gratuita, las siguientes tienen costo).
- Modificaciones al codigo del sistema (custom development).
- Problemas externos: falla de internet, impresora rota, SUNAT caido.
- Consultoria de negocio: "¿Cuanto debo cobrar?" (fuera de alcance).

### A PARTIR DEL DIA 31: SOPORTE INCLUIDO EN LA TARIFA ANUAL

**Desde el dia 31 en adelante, el soporte tecnico continua, pero con condiciones normales (no prioritario).**

**Caracteristicas:**

**Canales:**
- WhatsApp Business de dignita.tech (numero oficial).
- Correo electronico: soporte@dignita.tech.
- Portal de tickets: https://mirestconia.com/soporte.

**Tiempos de respuesta:**

| Tipo de Problema | Definicion | Tiempo Maximo |
|------------------|-----------|---------------|
| **Critica** | Sistema completamente inoperativo, no se puede cobrar | 2 horas (dias habiles) |
| **Alta** | Un modulo no funciona, afecta operacion significativamente | 4 horas (dias habiles) |
| **Media** | Funcionalidad afectada parcialmente, hay alternativa | 24 horas (dias habiles) |
| **Baja** | Consultas, dudas, ajustes menores | 48 horas (dias habiles) |

**Horario:**
- Lunes a viernes: 08:00 - 18:00.
- Sabados: 09:00 - 14:00.
- Domingos y feriados: Soporte limitado a emergencias criticas.

**Costo:**
- Incluido en la tarifa anual de S/ 700.00.
- No hay costo adicional para soporte incluido en la tarifa.

---

## CONTACTOS Y RECURSOS

### DURANTE IMPLEMENTACION (Dias 1-5)

**Consultor Asignado:**
- Nombre: _______________________________________________
- Telefono / WhatsApp: _______________________________________________
- Email: _______________________________________________

### DESPUES DE IMPLEMENTACION (A partir del Dia 6)

**Soporte General:**
- WhatsApp Business: _______________________________________________
- Email: soporte@dignita.tech
- Portal de Tickets: https://mirestconia.com/soporte

**Equipo de dignita.tech:**
- Gerente de Cuenta: _______________________________________________
- Equipo Tecnico: soporte@dignita.tech

---

## GUIA RAPIDA DE TROUBLESHOOTING

### "El sistema no carga"

**Pasos:**
1. Verificar que hay conexion a internet (abrir Google en navegador).
2. Refrescar la pagina (Ctrl+R o Cmd+R).
3. Limpiar cache del navegador (Ctrl+Shift+Del).
4. Intentar en otra computadora o dispositivo.
5. Si sigue sin funcionar, contactar a soporte via WhatsApp con captura de pantalla del error.

### "No aparece un producto en el catalogo"

**Pasos:**
1. Ir a Administrador → Productos.
2. Buscar el producto por nombre.
3. Verificar que NO esta marcado como "Inactivo".
4. Si esta inactivo, hacerlo activo.
5. Refrescar el navegador del mesero.

### "Un mesero no puede acceder"

**Pasos:**
1. Administrador → Usuarios.
2. Buscar al usuario.
3. Verificar que el estado es "Activo".
4. Verificar que tiene contraseña asignada.
5. Si no recuerda contraseña, administrador puede resetearla.
6. El usuario intenta login con nueva contraseña.

### "No sale la boleta en SUNAT"

**Pasos:**
1. Ir a Cajero → Reportes de Facturacion.
2. Buscar la boleta por numero.
3. Ver el estado: ¿Emitida? ¿Rechazada?
4. Si rechazada, leer mensaje de error (SUNAT da razon).
5. Comun: falta RUC del cliente en la factura. Verificar.
6. Si es un problema de SUNAT (caido), reintentar mas tarde.

### "La impresora no imprime"

**Pasos:**
1. Verificar que la impresora esta encendida y tiene papel.
2. Verificar que la impresora esta conectada a la WiFi o USB.
3. En el navegador, abrir print preview (Ctrl+P) y ver si el documento se ve bien.
4. Si se ve bien pero no imprime, problema de driver. Contactar a soporte tecnico de impresora o a dignita.tech.

### "Stock bajo pero ingrediente disponible"

**Pasos:**
1. Ir a Administrador → Inventario.
2. Buscar ingrediente.
3. Ver stock actual vs. stock minimo.
4. Si stock actual < minimo, sistema alertara.
5. Para cambiar stock minimo: Editar ingrediente → Cambiar valor minimo.
6. Los alertas son sugerencias, no restricciones obligatorias.

### "El sistema es muy lento"

**Pasos:**
1. Verificar velocidad de internet (abrir speed.test.net).
2. Si hay muchos usuarios conectados, algunos se pueden desconectar.
3. Cerrar tabs innecesarios del navegador.
4. Reiniciar el navegador.
5. Si persiste, contactar a soporte (puede haber problema de servidor).

---

## PROXIMO PASO: OPERACION DIARIA

**El sistema esta listo. Ahora:**

1. **Dias 6-30:** Seguir operando normalmente. Cualquier duda, contactar por WhatsApp al consultor.
2. **Dia 30:** Se termina el soporte prioritario. A partir del Dia 31, soporte normal incluido en tarifa anual.
3. **Siguiente año:** El Dia del vencimiento de la tarifa anual, se renueva automaticamente (a menos que comunique lo contrario 30 dias antes).

**Consejos para el exito:**

- Usa DalIA: Pregunta al asistente inteligente tus dudas operativas. Aprende de sus respuestas.
- Revisa reportes regularmente: Entiende tus numeros. ¿Cual es el plato mas vendido? ¿Cual es tu margen?
- Mantén actualizado el inventario: Registra entradas y mermas a diario.
- Respalda tus datos: El sistema lo hace automaticamente, pero tu tambien puedes exportar mensualmente.
- Forma a tu personal: Si llega personal nuevo, muestra el sistema usando el manual o video.
- Solicita features nuevas: Si necesitas una funcionalidad que no tiene, avisa a dignita.tech.

---

**Bienvenido a MiRestconIA. Que disfrutes tu transformacion digital.**

---

*Documento de Implementacion | MiRestconIA Plan Enterprise*
*dignita.tech — Lima, Peru — 2026*
*Version 1.0*
