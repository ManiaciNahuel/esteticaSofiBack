import express from 'express';
import { pool } from '../db/index.js';
const router = express.Router();

/**
 * 📋 Obtener todos los servicios
 * GET /api/services
 */
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT * FROM services 
            WHERE active = true 
            ORDER BY orden_prioridad ASC, category, name
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener servicios:', err);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
});

/**
 * 📋 Obtener todos los servicios (incluyendo inactivos) para administración
 * GET /api/services/admin
 */
router.get('/admin', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT * FROM services 
            ORDER BY orden_prioridad ASC, category, name
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener servicios para admin:', err);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
});

/**
 * ➕ Crear un nuevo servicio
 * POST /api/services
 */
router.post('/', async (req, res) => {
    const {
        name,
        base_price,
        base_duration_minutes = 60,
        category,
        orden_prioridad = 999,
        active = true
    } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'El nombre del servicio es requerido' });
    }

    try {
        await pool.query('BEGIN');

        // Si la prioridad no es 999, ajustar las prioridades existentes
        if (orden_prioridad !== 999) {
            // Mover todos los servicios con prioridad >= la nueva hacia abajo
            await pool.query(`
                UPDATE services 
                SET orden_prioridad = orden_prioridad + 1 
                WHERE orden_prioridad >= $1 AND orden_prioridad != 999
            `, [orden_prioridad]);
        }

        const insertQuery = `
            INSERT INTO services (name, base_price, base_duration_minutes, category, orden_prioridad, active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const { rows } = await pool.query(insertQuery, [
            name.trim(),
            base_price || 0,
            base_duration_minutes,
            category?.trim() || null,
            orden_prioridad,
            active
        ]);

        await pool.query('COMMIT');
        res.status(201).json(rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al crear servicio:', err);
        if (err.code === '23505') { // Unique constraint violation
            res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error al crear servicio' });
        }
    }
});

/**
 * ✏️ Actualizar servicio
 * PATCH /api/services/:id
 */
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        name,
        base_price,
        base_duration_minutes,
        category,
        orden_prioridad,
        active
    } = req.body;

    try {
        await pool.query('BEGIN');

        // Si se está cambiando la prioridad y no es 999
        if (orden_prioridad !== undefined) {
            // Obtener la prioridad actual del servicio
            const { rows: currentService } = await pool.query(
                'SELECT orden_prioridad FROM services WHERE id = $1',
                [id]
            );

            if (currentService.length === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({ error: 'Servicio no encontrado' });
            }

            const currentPriority = currentService[0].orden_prioridad;

            // Solo ajustar si la prioridad cambió y la nueva no es 999
            if (orden_prioridad !== currentPriority && orden_prioridad !== 999) {
                // Primero, "sacar" el servicio actual de su posición (ponerlo temporalmente en 9999)
                await pool.query(
                    'UPDATE services SET orden_prioridad = 9999 WHERE id = $1',
                    [id]
                );

                // Mover todos los servicios con prioridad >= la nueva hacia abajo
                await pool.query(`
                    UPDATE services 
                    SET orden_prioridad = orden_prioridad + 1 
                    WHERE orden_prioridad >= $1 AND orden_prioridad != 999 AND orden_prioridad != 9999
                `, [orden_prioridad]);

                // Si la prioridad anterior no era 999, cerrar el hueco que quedó
                if (currentPriority !== 999) {
                    await pool.query(`
                        UPDATE services 
                        SET orden_prioridad = orden_prioridad - 1 
                        WHERE orden_prioridad > $1 AND orden_prioridad != 999 AND orden_prioridad != 9999
                    `, [currentPriority]);
                }
            }
        }

        const updateQuery = `
            UPDATE services 
            SET name = COALESCE($1, name),
                base_price = COALESCE($2, base_price),
                base_duration_minutes = COALESCE($3, base_duration_minutes),
                category = COALESCE($4, category),
                orden_prioridad = COALESCE($5, orden_prioridad),
                active = COALESCE($6, active)
            WHERE id = $7
            RETURNING *
        `;
        
        const { rows } = await pool.query(updateQuery, [
            name?.trim(),
            base_price,
            base_duration_minutes,
            category?.trim(),
            orden_prioridad,
            active,
            id
        ]);
        
        if (!rows.length) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        await pool.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al actualizar servicio:', err);
        if (err.code === '23505') {
            res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error al actualizar servicio' });
        }
    }
});

/**
 * ❌ Eliminar servicio (soft delete)
 * DELETE /api/services/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if service is being used in appointments
        const { rows: appointmentCheck } = await pool.query(
            'SELECT COUNT(*) as count FROM appointments WHERE service_id = $1',
            [id]
        );
        
        if (parseInt(appointmentCheck[0].count) > 0) {
            // Soft delete if service is being used
            const { rows } = await pool.query(
                'UPDATE services SET active = false WHERE id = $1 RETURNING *',
                [id]
            );
            
            if (!rows.length) {
                return res.status(404).json({ error: 'Servicio no encontrado' });
            }
            
            res.json({ 
                message: 'Servicio desactivado (tiene turnos asociados)',
                service: rows[0]
            });
        } else {
            // Hard delete if no appointments are using this service
            const { rowCount } = await pool.query(
                'DELETE FROM services WHERE id = $1',
                [id]
            );
            
            if (!rowCount) {
                return res.status(404).json({ error: 'Servicio no encontrado' });
            }
            
            res.json({ message: 'Servicio eliminado correctamente' });
        }
    } catch (err) {
        console.error('Error al eliminar servicio:', err);
        res.status(500).json({ error: 'Error al eliminar servicio' });
    }
});

/**
 * 📊 Obtener estadísticas del servicio
 * GET /api/services/:id/stats
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
            WHERE service_id = $1
        `;
        
        const { rows } = await pool.query(statsQuery, [id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('Error al obtener estadísticas del servicio:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

/**
 * 🔢 Obtener información de prioridades para el frontend
 * GET /api/services/priorities/info
 */
router.get('/priorities/info', async (req, res) => {
    try {
        // Obtener todas las prioridades en uso (excluyendo 999)
        const { rows: usedPriorities } = await pool.query(`
            SELECT DISTINCT orden_prioridad 
            FROM services 
            WHERE orden_prioridad != 999 AND active = true
            ORDER BY orden_prioridad ASC
        `);

        // Encontrar la siguiente prioridad disponible
        const used = usedPriorities.map(row => row.orden_prioridad);
        let nextAvailable = 1;
        while (used.includes(nextAvailable)) {
            nextAvailable++;
        }

        res.json({
            usedPriorities: used,
            nextAvailable,
            maxUsedPriority: used.length > 0 ? Math.max(...used) : 0
        });
    } catch (err) {
        console.error('Error al obtener información de prioridades:', err);
        res.status(500).json({ error: 'Error al obtener información de prioridades' });
    }
});

export default router;
