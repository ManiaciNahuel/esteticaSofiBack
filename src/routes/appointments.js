import express from "express";
import { pool } from "../db/index.js";
const router = express.Router();

/**
 * 📅 Obtener turnos (por rango de fechas)
 * Ejemplo: GET /api/appointments?from=2025-10-25&to=2025-10-27
 */
router.get("/", async (req, res) => {
    const { from, to } = req.query;

    try {
        const query = `
      SELECT a.*, e.name AS employee_name, e.color AS employee_color, 
             s.name AS service_name, c.full_name AS client_name
      FROM appointments a
      LEFT JOIN employees e ON a.employee_id = e.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN clients c ON a.client_id = c.id
      WHERE ($1::date IS NULL OR a.starts_at::date >= $1::date)
        AND ($2::date IS NULL OR a.ends_at::date <= $2::date)
      ORDER BY a.starts_at ASC
    `;
        const { rows } = await pool.query(query, [from || null, to || null]);
        res.json(rows);
    } catch (err) {
        console.error("Error al obtener turnos:", err);
        res.status(500).json({ error: "Error al obtener turnos" });
    }
});

/**
 * ➕ Crear un nuevo turno
 */
router.post("/", async (req, res) => {
    const {
        employee_id,
        client,
        service_id,
        final_price,
        final_duration_minutes,
        notes,
        starts_at,
        ends_at,
    } = req.body;

    const clientName = client?.full_name || null;
    const clientPhone = client?.phone || null;

    try {
        // 1️⃣ Crear cliente si viene info
        let client_id = null;
        if (clientName) {
            const clientResult = await pool.query(
                `INSERT INTO clients (full_name, phone)
         VALUES ($1, $2)
         ON CONFLICT (full_name) DO UPDATE SET phone = EXCLUDED.phone
         RETURNING id`,
                [clientName, clientPhone]
            );
            client_id = clientResult.rows[0].id;
        }

        // 2️⃣ Crear el turno
        const insertQuery = `
      INSERT INTO appointments 
      (employee_id, client_id, service_id, final_price, final_duration_minutes, notes, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
        const values = [
            employee_id,
            client_id,
            service_id,
            final_price,
            final_duration_minutes,
            notes,
            starts_at,
            ends_at,
        ];
        const { rows } = await pool.query(insertQuery, values);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error("Error al crear turno:", err);
        res.status(500).json({ error: "Error al crear turno" });
    }
});

/**
 * ✏️ Actualizar turno (estado, observaciones, fechas, etc.)
 */
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { status, notes, final_price, final_duration_minutes, starts_at, ends_at } = req.body;

    try {
        const query = `
      UPDATE appointments
      SET status = COALESCE($1, status),
          notes = COALESCE($2, notes),
          final_price = COALESCE($3, final_price),
          final_duration_minutes = COALESCE($4, final_duration_minutes),
          starts_at = COALESCE($5, starts_at),
          ends_at = COALESCE($6, ends_at),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;
        const { rows } = await pool.query(query, [
            status,
            notes,
            final_price,
            final_duration_minutes,
            starts_at,
            ends_at,
            id,
        ]);

        if (!rows.length) return res.status(404).json({ error: "Turno no encontrado" });
        res.json(rows[0]);
    } catch (err) {
        console.error("Error al actualizar turno:", err);
        res.status(500).json({ error: "Error al actualizar turno" });
    }
});

/**
 * ❌ Eliminar turno
 */
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query("DELETE FROM appointments WHERE id = $1", [id]);
        if (!rowCount) return res.status(404).json({ error: "Turno no encontrado" });
        res.json({ message: "Turno eliminado correctamente" });
    } catch (err) {
        console.error("Error al eliminar turno:", err);
        res.status(500).json({ error: "Error al eliminar turno" });
    }
});

/**
 * 🔍 Buscar turnos por cliente
 * GET /api/appointments/search?client=nombre
 */
router.get("/search", async (req, res) => {
    const { client } = req.query;

    if (!client || client.trim().length < 2) {
        return res.status(400).json({ error: "Debe proporcionar al menos 2 caracteres para buscar" });
    }

    try {
        const query = `
            SELECT a.*, e.name AS employee_name, e.color AS employee_color, 
                   s.name AS service_name, c.full_name AS client_name, c.phone AS client_phone
            FROM appointments a
            LEFT JOIN employees e ON a.employee_id = e.id
            LEFT JOIN services s ON a.service_id = s.id
            LEFT JOIN clients c ON a.client_id = c.id
            WHERE c.full_name ILIKE $1
            ORDER BY a.starts_at DESC
            LIMIT 50
        `;
        
        const { rows } = await pool.query(query, [`%${client.trim()}%`]);
        res.json(rows);
    } catch (err) {
        console.error("Error al buscar turnos por cliente:", err);
        res.status(500).json({ error: "Error al buscar turnos por cliente" });
    }
});

export default router;
