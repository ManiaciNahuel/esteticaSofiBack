import express from 'express';
import { pool } from '../db/index.js';
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM employees WHERE active = true ORDER BY name');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener empleadas' });
    }
});

export default router;
