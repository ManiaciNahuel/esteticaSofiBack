import { pool } from "../db/index.js";

/**
 * Recalcula el estado de un turno según lo pagado vs. su precio.
 * - DONE si hay pagos y cubren el precio (o el turno no tiene precio).
 * - SCHEDULED si estaba DONE y ya no está cubierto.
 */
export async function syncAppointmentStatus(appointmentId) {
    const { rows: sumRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total FROM payments WHERE appointment_id = $1`,
        [appointmentId]
    );
    const totalPagado = Number(sumRows[0].total);

    const { rows } = await pool.query(
        `SELECT final_price, status FROM appointments WHERE id = $1`,
        [appointmentId]
    );
    if (!rows.length) return { totalPagado, precioFinal: 0, status: null };

    const precioFinal = Number(rows[0].final_price || 0);
    const actual = rows[0].status;
    const pagado = totalPagado > 0 && totalPagado >= precioFinal;
    const nuevo = pagado ? "DONE" : actual === "DONE" ? "SCHEDULED" : actual;

    if (nuevo !== actual) {
        await pool.query(
            `UPDATE appointments SET status = $2, updated_at = NOW() WHERE id = $1`,
            [appointmentId, nuevo]
        );
    }
    return { totalPagado, precioFinal, status: nuevo, statusChanged: nuevo !== actual ? nuevo : false };
}
