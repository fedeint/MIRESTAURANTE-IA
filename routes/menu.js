const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    // Basic cache headers
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

    try {
        const tid = req.tenantId || 1;
        // Try to fetch real products from DB
        const [productos] = await db.query(
            "SELECT id, nombre, precio, descripcion, categoria, imagen_url FROM productos WHERE tenant_id = ? AND activo = true ORDER BY categoria, nombre",
            [tid]
        );
        res.render('menu', { productos });
    } catch (e) {
        console.error('Error fetching menu:', e.message);
        // Fallback to mock data if table structure differs
        const mockProductos = [
            { id: 1, nombre: 'Hamburguesa Clásica', precio: 15.00, descripcion: 'Jugosa carne de res con queso derretido, lechuga fresca y tomate.', categoria: 'Platos', imagen_url: '' },
            { id: 2, nombre: 'Pizza Margarita', precio: 25.00, descripcion: 'Masa artesanal con salsa de tomate especial y mozzarella.', categoria: 'Platos', imagen_url: '' },
            { id: 3, nombre: 'Papas Fritas', precio: 8.00, descripcion: 'Crujientes papas fritas con corte rústico.', categoria: 'Acompañamientos', imagen_url: '' },
            { id: 4, nombre: 'Gaseosa', precio: 5.00, descripcion: 'Refresco helado de 500ml.', categoria: 'Bebidas', imagen_url: '' }
        ];
        res.render('menu', { productos: mockProductos });
    }
});

module.exports = router;
