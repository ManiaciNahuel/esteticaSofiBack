import app from './app.js';
import dotenv from 'dotenv';
dotenv.config();

// Configurar zona horaria del proceso Node.js
process.env.TZ = 'America/Argentina/Buenos_Aires';

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Maniaci API corriendo en puerto ${PORT}`));
