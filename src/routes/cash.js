import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * 📊 Caja diaria
 * GET /api/cash/daily?date=2025-10-27
 */
router.get("/daily", async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Debe especificar una fecha (YYYY-MM-DD)" });
  }

  try {
    // Totales por forma de pago y empleada
    const query = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        p.method,
        SUM(p.amount)::numeric(12,2) AS total_monto
      FROM payments p
      JOIN appointments a ON a.id = p.appointment_id
      JOIN employees e ON e.id = a.employee_id
      WHERE a.status = 'DONE'
        AND a.starts_at::date = $1::date
      GROUP BY e.id, e.name, p.method
      ORDER BY e.name, p.method;
    `;
    const { rows } = await pool.query(query, [date]);

    // Totales por empleada (split 50/50)
    const resumenQuery = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        SUM(p.amount)::numeric(12,2) AS total_bruto,
        ROUND(SUM(p.amount) * 0.5, 2)::numeric(12,2) AS para_empleada,
        ROUND(SUM(p.amount) * 0.5, 2)::numeric(12,2) AS para_local
      FROM payments p
      JOIN appointments a ON a.id = p.appointment_id
      JOIN employees e ON e.id = a.employee_id
      WHERE a.status = 'DONE'
        AND a.starts_at::date = $1::date
      GROUP BY e.id, e.name
      ORDER BY e.name;
    `;
    const { rows: resumen } = await pool.query(resumenQuery, [date]);

    // Estructurar respuesta
    const agrupado = {};

    for (const row of rows) {
      const { employee_name, method, total_monto } = row;
      if (!agrupado[employee_name]) agrupado[employee_name] = {};
      agrupado[employee_name][method] = Number(total_monto);
    }

    res.json({
      fecha: date,
      totales_por_metodo: rows,
      resumen_por_empleada: resumen,
      agrupado_por_empleada: agrupado,
    });
  } catch (err) {
    console.error("Error al obtener caja diaria:", err);
    res.status(500).json({ error: "Error al obtener caja diaria" });
  }
});

export default router;
