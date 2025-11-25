import express from 'express';
import { pool } from '../db/index.js';
const router = express.Router();

/**
 * 👥 Obtener todos los clientes
 * GET /api/clients
 */
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM clients ORDER BY full_name');
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener clientes:', err);
        res.status(500).json({ error: 'Error al obtener clientes' });
    }
});

/**
 * 🔍 Buscar clientes por nombre
 * GET /api/clients/search?q=nombre
 */
router.get('/search', async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: 'Debe proporcionar al menos 2 caracteres para buscar' });
    }

    try {
        const query = `
            SELECT c.id, c.full_name, c.phone, 
                   COUNT(a.id) as total_appointments,
                   MAX(a.starts_at) as last_appointment
            FROM clients c
            LEFT JOIN appointments a ON c.id = a.client_id
            WHERE c.full_name ILIKE $1
            GROUP BY c.id, c.full_name, c.phone
            ORDER BY total_appointments DESC, c.full_name ASC
            LIMIT 10
        `;
        
        const { rows } = await pool.query(query, [`%${q.trim()}%`]);
        res.json(rows);
    } catch (err) {
        console.error('Error al buscar clientes:', err);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
});

/**
 * ➕ Crear un nuevo cliente
 * POST /api/clients
 */
router.post('/', async (req, res) => {
    const { full_name, phone } = req.body;

    if (!full_name) {
        return res.status(400).json({ error: 'El nombre es requerido' });
    }

    try {
        const query = `
            INSERT INTO clients (full_name, phone)
            VALUES ($1, $2)
            ON CONFLICT (full_name) DO UPDATE SET 
                phone = EXCLUDED.phone,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [full_name.trim(), phone || null]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error al crear cliente:', err);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

/**
 * ✏️ Actualizar cliente
 * PATCH /api/clients/:id
 */
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, phone } = req.body;

    try {
        const query = `
            UPDATE clients 
            SET full_name = COALESCE($1, full_name),
                phone = COALESCE($2, phone),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [full_name, phone, id]);
        
        if (!rows.length) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error al actualizar cliente:', err);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

/**
 * 📊 Obtener estadísticas del cliente
 * GET /api/clients/:id/stats
 */
router.get('/:id/stats', async (req, res) => {
    const { id } = req.params;

    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status = 'DONE' THEN 1 END) as completed_appointments,
                AVG(final_price)::numeric(10,2) as average_price,
                SUM(CASE WHEN status = 'DONE' THEN final_price ELSE 0 END)::numeric(10,2) as total_revenue,
                MAX(starts_at) as last_appointment,
                MIN(starts_at) as first_appointment
            FROM appointments 
            WHERE client_id = $1
        `;
        
        const { rows: stats } = await pool.query(statsQuery, [id]);
        
        // Obtener servicios más frecuentes
        const servicesQuery = `
            SELECT s.name, COUNT(*) as frequency
            FROM appointments a
            JOIN services s ON a.service_id = s.id
            WHERE a.client_id = $1
            GROUP BY s.name
            ORDER BY frequency DESC
            LIMIT 5
        `;
        
        const { rows: services } = await pool.query(servicesQuery, [id]);
        
        res.json({
            ...stats[0],
            frequent_services: services
        });
    } catch (err) {
        console.error('Error al obtener estadísticas del cliente:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas del cliente' });
    }
});

export default router;