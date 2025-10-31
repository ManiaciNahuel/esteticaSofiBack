import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * 💰 Registrar múltiples pagos para un turno
 * POST /api/payments/:appointmentId
 */
router.post("/:appointmentId", async (req, res) => {
    const { appointmentId } = req.params;
    const payments = req.body; // [{method, amount}, ...]

    try {
        if (!Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ error: "Debe enviar al menos un pago" });
        }

        const allowedMethods = ["CASH", "TRANSFER"];
        const results = [];

        for (const p of payments) {
            const { method, amount } = p;

            if (!method || !amount) continue;
            if (!allowedMethods.includes(method)) {
                return res
                    .status(400)
                    .json({ error: `Método de pago inválido: ${method}` });
            }

            const { rows } = await pool.query(
                `INSERT INTO payments (appointment_id, method, amount)
         VALUES ($1, $2, $3)
         RETURNING id, method, amount, created_at`,
                [appointmentId, method, amount]
            );
            results.push(rows[0]);
        }

        // verificar si ya se completó el pago total
        const { rows: sumRows } = await pool.query(
            `SELECT SUM(amount)::numeric(12,2) as total FROM payments WHERE appointment_id = $1`,
            [appointmentId]
        );
        const totalPagado = Number(sumRows[0]?.total || 0);

        const { rows: turnoRows } = await pool.query(
            `SELECT final_price FROM appointments WHERE id = $1`,
            [appointmentId]
        );
        const precioFinal = Number(turnoRows[0]?.final_price || 0);

        if (precioFinal > 0 && totalPagado >= precioFinal) {
            await pool.query(
                `UPDATE appointments SET status = 'DONE', updated_at = NOW() WHERE id = $1`,
                [appointmentId]
            );
        }

        res.status(201).json({ pagos: results, totalPagado });
    } catch (err) {
        console.error("Error al registrar pagos:", err);
        res.status(500).json({ error: "Error al registrar pagos" });
    }
});

/**
 * � Crear pagos (endpoint alternativo)
 * POST /api/payments
 */
router.post("/", async (req, res) => {
    const { appointment_id, payments } = req.body;

    try {
        if (!appointment_id || !Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ error: "appointment_id y payments son requeridos" });
        }

        const allowedMethods = ["CASH", "TRANSFER", "CARD", "MP"];
        const results = [];

        for (const p of payments) {
            const { method, amount } = p;

            if (!method || !amount) continue;
            if (!allowedMethods.includes(method)) {
                return res.status(400).json({ error: `Método de pago inválido: ${method}` });
            }

            const { rows } = await pool.query(
                `INSERT INTO payments (appointment_id, method, amount)
         VALUES ($1, $2, $3)
         RETURNING id, method, amount, created_at`,
                [appointment_id, method, amount]
            );
            results.push(rows[0]);
        }

        // Verificar si ya se completó el pago total
        const { rows: sumRows } = await pool.query(
            `SELECT SUM(amount)::numeric(12,2) as total FROM payments WHERE appointment_id = $1`,
            [appointment_id]
        );
        const totalPagado = Number(sumRows[0]?.total || 0);

        const { rows: turnoRows } = await pool.query(
            `SELECT final_price FROM appointments WHERE id = $1`,
            [appointment_id]
        );
        const precioFinal = Number(turnoRows[0]?.final_price || 0);

        if (precioFinal > 0 && totalPagado >= precioFinal) {
            await pool.query(
                `UPDATE appointments SET status = 'DONE', updated_at = NOW() WHERE id = $1`,
                [appointment_id]
            );
        }

        res.status(201).json({ pagos: results, totalPagado });
    } catch (err) {
        console.error("Error al crear pagos:", err);
        res.status(500).json({ error: "Error al crear pagos" });
    }
});

/**
 * �📄 Obtener pagos de un turno
 * GET /api/payments/:appointmentId
 */
router.get("/:appointmentId", async (req, res) => {
    const { appointmentId } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, method, amount, created_at
       FROM payments
       WHERE appointment_id = $1
       ORDER BY created_at ASC`,
            [appointmentId]
        );
        res.json(rows);
    } catch (err) {
        console.error("Error al obtener pagos:", err);
        res.status(500).json({ error: "Error al obtener pagos" });
    }
});

export default router;
