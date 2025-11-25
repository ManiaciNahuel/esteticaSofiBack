import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

// Obtener todas las anotaciones de un rango de fechas (debe ir antes de /:date)
router.get('/', async (req, res) => {
    try {
        const { from, to } = req.query;
        let query = 'SELECT * FROM daily_notes';
        let values = [];
        
        if (from && to) {
            query += ' WHERE date BETWEEN $1 AND $2';
            values = [from, to];
        }
        
        query += ' ORDER BY date ASC';
        
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener anotaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener anotación de un día específico
router.get('/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const query = 'SELECT * FROM daily_notes WHERE date = $1';
        const result = await pool.query(query, [date]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            // Devolver objeto vacío en lugar de 404 cuando no hay anotación
            res.json({ date, content: '' });
        }
    } catch (error) {
        console.error('Error al obtener anotación diaria:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear o actualizar anotación diaria
router.post('/', async (req, res) => {
    try {
        const { date, content } = req.body;
        
        if (!date || !content) {
            return res.status(400).json({ error: 'Fecha y contenido son requeridos' });
        }

        // Verificar si ya existe una anotación para esta fecha
        const existingQuery = 'SELECT id FROM daily_notes WHERE date = $1';
        const existingResult = await pool.query(existingQuery, [date]);
        
        let query, values;
        if (existingResult.rows.length > 0) {
            // Actualizar anotación existente
            query = 'UPDATE daily_notes SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE date = $2 RETURNING *';
            values = [content, date];
        } else {
            // Crear nueva anotación
            query = 'INSERT INTO daily_notes (date, content) VALUES ($1, $2) RETURNING *';
            values = [date, content];
        }
        
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al guardar anotación diaria:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar anotación diaria
router.delete('/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const query = 'DELETE FROM daily_notes WHERE date = $1 RETURNING *';
        const result = await pool.query(query, [date]);
        
        if (result.rows.length > 0) {
            res.json({ message: 'Anotación eliminada exitosamente' });
        } else {
            res.status(404).json({ message: 'No se encontró anotación para esta fecha' });
        }
    } catch (error) {
        console.error('Error al eliminar anotación diaria:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;