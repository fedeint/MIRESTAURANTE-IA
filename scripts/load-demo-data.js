// USAGE:
//   node -r dotenv/config scripts/load-demo-data.js dotenv_config_path=/tmp/prod.env
//
// Requires DATABASE_URL env var. NEVER hardcode connection strings or
// credentials in source — see CLAUDE.md §2.
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error('Run with: node -r dotenv/config scripts/load-demo-data.js dotenv_config_path=<path-to-env-file>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  const c = await pool.connect();
  try {
    // Add categoria column
    await c.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50)').catch(()=>{});

    // PRODUCTOS
    const productos = [
      ['PLT001','Ceviche Clasico',28,'Platos de fondo','https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400'],
      ['PLT002','Lomo Saltado',32,'Platos de fondo','https://images.unsplash.com/photo-1633321702518-7fecdafb94d5?w=400'],
      ['PLT003','Aji de Gallina',25,'Platos de fondo','https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400'],
      ['PLT004','Arroz con Pollo',22,'Platos de fondo','https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400'],
      ['PLT005','Arroz con Mariscos',35,'Platos de fondo','https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400'],
      ['PLT006','Arroz Chaufa de Pollo',20,'Platos de fondo','https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400'],
      ['PLT007','Arroz Chaufa Especial',28,'Platos de fondo','https://images.unsplash.com/photo-1512058533027-3c0f5f1e7534?w=400'],
      ['PLT008','Pollo a la Brasa 1/4',18,'Platos de fondo','https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400'],
      ['PLT009','Pollo a la Brasa 1/2',32,'Platos de fondo','https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400'],
      ['PLT010','Seco de Res con Frejoles',25,'Platos de fondo','https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400'],
      ['PLT011','Tallarin Saltado',22,'Platos de fondo','https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400'],
      ['PLT012','Causa Limena',18,'Platos de fondo','https://images.unsplash.com/photo-1551326844-4df70f78d0e9?w=400'],
      ['PLT013','Jalea Mixta',38,'Platos de fondo','https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=400'],
      ['PLT014','Chicharron de Pescado',28,'Platos de fondo','https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400'],
      ['PLT015','Tacu Tacu con Lomo',35,'Platos de fondo','https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400'],
      ['SOP001','Caldo de Gallina',15,'Sopas y Entradas','https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400'],
      ['SOP002','Sopa a la Criolla',18,'Sopas y Entradas','https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=400'],
      ['SOP003','Papa a la Huancaina',12,'Sopas y Entradas','https://images.unsplash.com/photo-1551326844-4df70f78d0e9?w=400'],
      ['SOP004','Ocopa Arequipena',12,'Sopas y Entradas','https://images.unsplash.com/photo-1551326844-4df70f78d0e9?w=400'],
      ['SOP005','Tequenos (6 unid)',15,'Sopas y Entradas','https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400'],
      ['SOP006','Anticuchos de Corazon',18,'Sopas y Entradas','https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400'],
      ['SOP007','Choclo con Queso',10,'Sopas y Entradas','https://images.unsplash.com/photo-1551326844-4df70f78d0e9?w=400'],
      ['SOP008','Leche de Tigre',15,'Sopas y Entradas','https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400'],
      ['BEB001','Chicha Morada (jarra)',12,'Bebidas','https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'],
      ['BEB002','Chicha Morada (vaso)',5,'Bebidas','https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'],
      ['BEB003','Limonada (jarra)',10,'Bebidas','https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400'],
      ['BEB004','Limonada (vaso)',4,'Bebidas','https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400'],
      ['BEB005','Inca Kola 500ml',5,'Bebidas','https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400'],
      ['BEB006','Coca-Cola 500ml',5,'Bebidas','https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400'],
      ['BEB007','Agua San Luis 500ml',3,'Bebidas','https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400'],
      ['BEB008','Cerveza Cusquena 620ml',12,'Bebidas','https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400'],
      ['BEB009','Cerveza Pilsen 620ml',10,'Bebidas','https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400'],
      ['BEB010','Pisco Sour',18,'Bebidas','https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400'],
      ['POS001','Suspiro Limeno',12,'Postres','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'],
      ['POS002','Mazamorra Morada',8,'Postres','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'],
      ['POS003','Arroz con Leche',8,'Postres','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'],
      ['POS004','Picarones (6 unid)',12,'Postres','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'],
      ['POS005','Torta Tres Leches',15,'Postres','https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400'],
      ['EXT001','Porcion de Arroz Extra',5,'Extras','https://images.unsplash.com/photo-1516684732162-798a0062be99?w=400'],
      ['EXT002','Porcion de Papas Fritas',8,'Extras','https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400'],
    ];
    for (const [cod,nom,precio,cat,img] of productos) {
      await c.query('INSERT INTO productos (codigo,nombre,precio_unidad,precio_kg,precio_libra,categoria,imagen) VALUES ($1,$2,$3,0,0,$4,$5) ON CONFLICT (codigo) DO UPDATE SET nombre=$2,precio_unidad=$3,categoria=$4,imagen=$5', [cod,nom,precio,cat,img]);
    }
    console.log('OK: ' + productos.length + ' productos');

    // MESAS
    for (let i = 1; i <= 40; i++) {
      const desc = i <= 10 ? 'Interior' : i <= 20 ? 'Terraza' : i <= 30 ? 'Salon privado' : 'Barra';
      await c.query("INSERT INTO mesas (numero,descripcion,estado) VALUES ($1,$2,'libre') ON CONFLICT (numero) DO NOTHING", [String(i), desc]);
    }
    console.log('OK: 40 mesas');

    // USUARIOS
    const bcrypt = require('bcryptjs');
    const users = [
      ['mozo1','Carlos','mesero',await bcrypt.hash('Mozo2026',10),'["mesas","cocina","productos"]'],
      ['mozo2','Maria','mesero',await bcrypt.hash('Mozo2026',10),'["mesas","cocina","productos"]'],
      ['mozo3','Pedro','mesero',await bcrypt.hash('Mozo2026',10),'["mesas","cocina","productos"]'],
      ['cocinero1','Chef Juan','cocinero',await bcrypt.hash('Cocina2026',10),'["cocina"]'],
      ['cajero1','Ana','cajero',await bcrypt.hash('Cajero2026',10),'["caja","facturacion","ventas"]'],
      ['almacen1','Luis','administrador',await bcrypt.hash('Almacen2026',10),'["almacen"]'],
    ];
    for (const [usr,nom,rol,hash,permisos] of users) {
      await c.query('INSERT INTO usuarios (usuario,nombre,rol,password_hash,activo,permisos) VALUES ($1,$2,$3,$4,true,$5) ON CONFLICT (usuario) DO NOTHING', [usr,nom,rol,hash,permisos]);
    }
    console.log('OK: 6 usuarios');

    // INSUMOS ALMACEN
    const insumos = [
      ['INS001','Pescado fresco (corvina)','kg',15,5,25],['INS002','Camarones','kg',8,3,45],['INS003','Pulpo','kg',5,2,35],
      ['INS004','Lomo fino de res','kg',20,8,32],['INS005','Pollo entero','kg',30,10,12],['INS006','Corazon de res','kg',10,4,15],
      ['INS007','Gallina entera','kg',8,3,14],['INS008','Cebolla roja','kg',25,10,3.5],['INS009','Tomate','kg',15,8,4],
      ['INS010','Aji amarillo','kg',5,2,8],['INS011','Aji limo','kg',3,1,10],['INS012','Papa amarilla','kg',30,15,3],
      ['INS013','Papa blanca','kg',25,12,2.5],['INS014','Camote','kg',10,5,2],['INS015','Choclo desgranado','kg',8,4,6],
      ['INS016','Lechuga','kg',5,2,3],['INS017','Limon','kg',10,5,5],['INS018','Culantro','kg',3,1,4],
      ['INS019','Perejil','kg',2,1,4],['INS020','Ajo','kg',3,1,12],['INS021','Arroz','kg',50,20,3.5],
      ['INS022','Frejol canario','kg',8,4,8],['INS023','Tallarin','kg',10,5,5],['INS024','Maiz morado','kg',5,2,6],
      ['INS025','Harina','kg',10,5,3],['INS026','Leche evaporada','lt',20,10,5],['INS027','Queso fresco','kg',5,2,18],
      ['INS028','Huevos','und',120,50,0.5],['INS029','Crema de leche','lt',5,2,8],['INS030','Aceite vegetal','lt',15,8,6],
      ['INS031','Sillao','lt',5,2,8],['INS032','Vinagre','lt',3,1,4],['INS033','Sal','kg',10,5,1.5],
      ['INS034','Pimienta','kg',2,0.5,25],['INS035','Comino','kg',1,0.3,30],['INS036','Oregano','kg',1,0.3,20],
      ['INS037','Pisco','lt',5,2,25],['INS038','Azucar','kg',15,8,3],['INS039','Canela en rama','kg',0.5,0.2,40],
      ['INS040','Gas balon 10kg','und',3,1,38],['INS041','Carbon','kg',20,10,3],['INS042','Servilletas paq','und',50,20,2],
      ['INS043','Conchas de abanico','kg',4,2,40],['INS044','Clavo de olor','kg',0.3,0.1,50],
      ['INS045','Bolsas para llevar','und',200,100,0.1],
    ];
    for (const [cod,nom,und,stock,min,costo] of insumos) {
      await c.query('INSERT INTO almacen_ingredientes (tenant_id,codigo,nombre,unidad_medida,stock_actual,stock_minimo,costo_unitario,activo) VALUES (1,$1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING', [cod,nom,und,stock,min,costo]);
    }
    console.log('OK: ' + insumos.length + ' insumos');

    // Verify
    const pc = await c.query('SELECT COUNT(*) as c FROM productos'); 
    const mc = await c.query('SELECT COUNT(*) as c FROM mesas');
    const uc = await c.query('SELECT COUNT(*) as c FROM usuarios');
    const ic = await c.query('SELECT COUNT(*) as c FROM almacen_ingredientes');
    console.log('TOTALES -> Productos:', pc.rows[0].c, 'Mesas:', mc.rows[0].c, 'Usuarios:', uc.rows[0].c, 'Insumos:', ic.rows[0].c);
  } finally { c.release(); pool.end(); }
}
run().catch(e => { console.error(e); process.exit(1); });
