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
 * ✏️ Actualizar turno completo (empleado, cliente, servicio, fechas, etc.)
 */
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const {
        employee_id,
        client,
        service_id,
        final_price,
        final_duration_minutes,
        notes,
        starts_at,
        ends_at,
        status
    } = req.body;

    try {
        // 1️⃣ Manejar cliente si se proporciona
        let client_id = null;
        if (client && client.full_name) {
            const clientName = client.full_name;
            const clientPhone = client.phone || null;

            const clientResult = await pool.query(
                `INSERT INTO clients (full_name, phone)
                 VALUES ($1, $2)
                 ON CONFLICT (full_name) DO UPDATE SET 
                    phone = EXCLUDED.phone
                 RETURNING id`,
                [clientName, clientPhone]
            );
            client_id = clientResult.rows[0].id;
        }

        // 2️⃣ Actualizar el turno
        const updateQuery = `
            UPDATE appointments
            SET employee_id = COALESCE($1, employee_id),
                client_id = COALESCE($2, client_id),
                service_id = COALESCE($3, service_id),
                final_price = COALESCE($4, final_price),
                final_duration_minutes = COALESCE($5, final_duration_minutes),
                notes = COALESCE($6, notes),
                starts_at = COALESCE($7, starts_at),
                ends_at = COALESCE($8, ends_at),
                status = COALESCE($9, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *;
        `;

        const { rows } = await pool.query(updateQuery, [
            employee_id,
            client_id,
            service_id,
            final_price,
            final_duration_minutes,
            notes,
            starts_at,
            ends_at,
            status,
            id
        ]);

        if (!rows.length) {
            return res.status(404).json({ error: "Turno no encontrado" });
        }

        // 3️⃣ Devolver el turno actualizado con información completa
        const fullInfoQuery = `
            SELECT a.*, e.name AS employee_name, e.color AS employee_color,
                   s.name AS service_name, c.full_name AS client_name, c.phone AS client_phone
            FROM appointments a
            LEFT JOIN employees e ON a.employee_id = e.id
            LEFT JOIN services s ON a.service_id = s.id
            LEFT JOIN clients c ON a.client_id = c.id
            WHERE a.id = $1
        `;

        const { rows: fullInfo } = await pool.query(fullInfoQuery, [id]);
        res.json(fullInfo[0]);

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