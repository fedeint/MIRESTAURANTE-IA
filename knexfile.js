require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'db.vfltsjcktxgmqbrzwthn.supabase.co',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'postgres',
    port: Number(process.env.DB_PORT) || 5432,
    ssl: { rejectUnauthorized: false }
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  pool: { min: 2, max: 10 }
};
