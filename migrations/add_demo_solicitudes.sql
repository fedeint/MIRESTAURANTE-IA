-- migrations/add_demo_solicitudes.sql
-- Stores demo appointment requests from /demo page

CREATE TABLE IF NOT EXISTS demo_solicitudes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  restaurante VARCHAR(200),
  whatsapp VARCHAR(20),
  paquete VARCHAR(50),
  fecha_preferida DATE,
  estado VARCHAR(20) DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW()
);
