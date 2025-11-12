import express from 'express';
import cors from 'cors';
import { pool } from './db/index.js';
import employeesRouter from './routes/employees.js';
import servicesRouter from './routes/services.js';
import appointmentsRouter from './routes/appointments.js';
import paymentsRouter from './routes/payments.js';
import cashRouter from './routes/cash.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/employees', employeesRouter);
app.use('/api/services', servicesRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/cash', cashRouter);

app.get('/', (req, res) => res.send('💅 Maniaci API OK'));

export default app;
