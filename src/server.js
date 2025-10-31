import app from './app.js';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Maniaci API corriendo en puerto ${PORT}`));
