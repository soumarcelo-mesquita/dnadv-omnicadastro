import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes';
import { initDatabase } from './db';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for frontend connection (support Vercel & local development)
app.use(cors({
  origin: '*', // In production, replace with your specific Vercel URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Express built-in body parsers
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Mount API routes under /api prefix
app.use('/api', router);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start Server and Initialize Database
async function startServer() {
  try {
    // Attempt database initialization
    if (process.env.DATABASE_URL) {
      await initDatabase();
    } else {
      console.warn("Skipping DB initialization: DATABASE_URL not defined. Set it to connect to Supabase PostgreSQL.");
    }
    
    app.listen(port, () => {
      console.log(`🚀 Name/CPF Matcher Backend running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Critical error starting backend server:", error);
    process.exit(1);
  }
}

startServer();
export default app;
