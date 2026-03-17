require('dotenv').config();

module.exports = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'reconocimiento',
    port: Number(process.env.DB_PORT) || 3306
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  pool: { min: 2, max: 10 }
};
