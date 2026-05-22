import { Router, Request, Response } from 'express';
import fs from 'fs';
import csvParser from 'csv-parser';
import { pool, supabase } from './db';
import { normalizeName, getTokens, matchTokens, buildFtsQuery } from './matcher';

export const router = Router();

/**
 * Authentication Middleware using Supabase Auth
 */
export async function requireAuth(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    // Attach user profile to request
    (req as any).user = user;
    next();
  } catch (err: any) {
    console.error('[Auth Middleware Error]', err);
    return res.status(500).json({ error: 'Erro interno de autenticação.' });
  }
}

// Interfaces
interface PersonRow {
  nome: string;
  cpf: string;
}

/**
 * Health check endpoint (PUBLIC for Render service checks)
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date() });
  } catch (error: any) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: error.message });
  }
});

// Protect all subsequent routes with Supabase Authentication
router.use(requireAuth);

/**
 * Database Stats endpoint
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const countRes = await pool.query('SELECT COUNT(*) as count FROM pessoas');
    const sampleRes = await pool.query('SELECT nome, cpf FROM pessoas LIMIT 5');
    res.json({
      totalRecords: parseInt(countRes.rows[0].count, 10),
      samples: sampleRes.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add a new record manually
 */
router.post('/pessoas', async (req: Request, res: Response) => {
  const { nome, cpf } = req.body;
  if (!nome || !cpf) {
    return res.status(400).json({ error: 'Name (nome) and CPF (cpf) are required.' });
  }

  try {
    const normalized = normalizeName(nome);
    await pool.query(
      'INSERT INTO pessoas (nome, cpf, nome_normalizado) VALUES ($1, $2, $3)',
      [nome.trim(), cpf.trim().substring(0, 50), normalized]
    );
    res.status(201).json({ message: 'Record created successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Smart Search Engine
 * GET /api/search?q=Marcelo M dos Santos
 */
router.get('/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Search query (q) is required.' });
  }

  try {
    const qNorm = normalizeName(query);
    const qTokens = getTokens(qNorm);

    if (qTokens.length === 0) {
      return res.json({ query, primaryMatch: null, alternates: [], isAmbiguous: false });
    }

    // Step 1: Pre-filter candidates using PostgreSQL FTS
    const ftsQuery = buildFtsQuery(query);
    
    let dbCandidates: any[] = [];
    
    if (ftsQuery) {
      // Fast index-driven query
      const dbQuery = `
        SELECT nome, cpf, nome_normalizado 
        FROM pessoas 
        WHERE to_tsvector('simple', nome_normalizado) @@ to_tsquery('simple', $1)
        LIMIT 150;
      `;
      const startTime = process.hrtime();
      const dbRes = await pool.query(dbQuery, [ftsQuery]);
      const endTime = process.hrtime(startTime);
      const dbMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      console.log(`[FTS Query] Found ${dbRes.rows.length} candidates in ${dbMs}ms`);
      dbCandidates = dbRes.rows;
    } else {
      // Fallback if all query tokens are single letters (abbreviations)
      const likeQueries = qTokens.map((t, idx) => `nome_normalizado LIKE $${idx + 1}`);
      const likeParams = qTokens.map(t => `%${t}%`);
      const dbQuery = `
        SELECT nome, cpf, nome_normalizado 
        FROM pessoas 
        WHERE ${likeQueries.join(' AND ')}
        LIMIT 100;
      `;
      const dbRes = await pool.query(dbQuery, likeParams);
      dbCandidates = dbRes.rows;
    }

    // Step 2: In-memory token alignment and scoring
    const matchedResults = dbCandidates
      .map(candidate => {
        const cTokens = getTokens(candidate.nome_normalizado);
        const matchResult = matchTokens(qTokens, cTokens);
        return {
          nome: candidate.nome,
          cpf: candidate.cpf,
          score: matchResult.score,
          explanation: matchResult.explanation,
          isMatch: matchResult.isMatch
        };
      })
      .filter(r => r.isMatch)
      .sort((a, b) => b.score - a.score);

    if (matchedResults.length === 0) {
      return res.json({
        query,
        primaryMatch: null,
        alternates: [],
        isAmbiguous: false,
        message: 'Nenhum resultado compatível encontrado.'
      });
    }

    // Determine primary match and alternates (checking for ambiguity)
    const primary = matchedResults[0];
    const alternates: typeof matchedResults = [];
    let isAmbiguous = false;

    // Any matches that have scores extremely close to the primary match (>0.9 and difference < 0.05)
    // are flagged as ambiguities (like Marcelo Mesquita vs Marcelo Messias).
    for (let i = 1; i < matchedResults.length; i++) {
      const candidate = matchedResults[i];
      if (candidate.score >= 0.70) {
        alternates.push(candidate);
        
        // If it's very close or identical in abbreviation score, mark as ambiguous
        if (primary.score - candidate.score < 0.05) {
          isAmbiguous = true;
        }
      }
    }

    return res.json({
      query,
      primaryMatch: primary,
      alternates,
      isAmbiguous,
      totalMatched: matchedResults.length
    });

  } catch (error: any) {
    console.error("Search API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk Import from Local CSV File Path
 * POST /api/pessoas/import-local
 * Body: { filePath: "C:/Projetos/dados.csv" }
 */
router.post('/pessoas/import-local', async (req: Request, res: Response) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath (absolute path to CSV) is required.' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found at: ${filePath}` });
  }

  try {
    console.log(`Starting bulk import from local file: ${filePath}`);
    
    // Auto-detect separator by reading the first line of the CSV
    let separator = ';';
    try {
      const firstLine = await new Promise<string>((resolve, reject) => {
        const reader = fs.createReadStream(filePath, { encoding: 'utf8' });
        let data = '';
        reader.on('data', (chunk) => {
          data += chunk;
          const lineEnd = data.indexOf('\n');
          if (lineEnd !== -1) {
            reader.destroy();
            resolve(data.substring(0, lineEnd));
          }
        });
        reader.on('end', () => resolve(data));
        reader.on('error', (err) => reject(err));
      });

      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      separator = commaCount > semiCount ? ',' : ';';
      console.log(`[CSV Auto-Detect] Semicolons: ${semiCount}, Commas: ${commaCount}. Detected Separator: "${separator}"`);
    } catch (err) {
      console.warn("Failed to auto-detect CSV separator, falling back to ';':", err);
    }

    const stream = fs.createReadStream(filePath);
    const batchSize = 5000;
    let batch: PersonRow[] = [];
    let totalInserted = 0;
    let startTime = Date.now();

    // Setup streaming pipeline
    stream
      .pipe(csvParser({ separator })) // Brazilian CSVs often use ';' as separator
      .on('data', (row: any) => {
        // Find keys dynamically (e.g. nome/name, cpf)
        const keys = Object.keys(row);
        const nameKey = keys.find(k => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'));
        const cpfKey = keys.find(k => k.toLowerCase().includes('cpf'));

        if (nameKey && cpfKey) {
          const nome = row[nameKey]?.trim();
          const cpf = row[cpfKey]?.trim();
          if (nome && cpf) {
            // Limit CPF to 50 characters to guarantee it fits in the VARCHAR(50) column
            const sanitizedCpf = cpf.substring(0, 50);
            batch.push({ nome, cpf: sanitizedCpf });
          }
        }
      })
      .on('end', async () => {
        try {
          console.log(`CSV stream parsed successfully. Total rows read: ${batch.length}`);
          
          // Insert in batches of 5,000
          for (let i = 0; i < batch.length; i += batchSize) {
            const currentBatch = batch.slice(i, i + batchSize);
            
            // Build bulk multi-row insert query
            // INSERT INTO pessoas (nome, cpf, nome_normalizado) VALUES ($1, $2, $3), ($4, $5, $6)...
            const valuesPlaceholder: string[] = [];
            const queryParams: any[] = [];
            
            currentBatch.forEach((row, idx) => {
              const baseIdx = idx * 3;
              valuesPlaceholder.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`);
              queryParams.push(row.nome, row.cpf, normalizeName(row.nome));
            });

            const query = `
              INSERT INTO pessoas (nome, cpf, nome_normalizado) 
              VALUES ${valuesPlaceholder.join(', ')}
            `;
            
            await pool.query(query, queryParams);
            totalInserted += currentBatch.length;
            console.log(`Inserted batch ${i / batchSize + 1}. Total: ${totalInserted} records`);
          }

          const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
          res.json({
            success: true,
            totalInserted,
            elapsedSeconds,
            message: `Successfully imported ${totalInserted} records in ${elapsedSeconds}s!`
          });

        } catch (dbError: any) {
          console.error("Database insert error during bulk import:", dbError);
          res.status(500).json({ error: 'DB insertion failed: ' + dbError.message });
        }
      })
      .on('error', (err) => {
        console.error("CSV stream reading error:", err);
        res.status(500).json({ error: 'CSV read failed: ' + err.message });
      });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk Enrichment Endpoint
 * POST /api/enrich
 * Body: { names: ["Marcelo M dos Santos", "Ana S. Silva"] }
 */
router.post('/enrich', async (req: Request, res: Response) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'An array of names is required.' });
  }

  try {
    const startTime = Date.now();
    const enrichedResults = [];

    // Process names sequentially or in parallel batches
    for (const rawName of names) {
      if (!rawName || rawName.trim().length === 0) {
        enrichedResults.push({
          originalName: rawName,
          enrichedName: null,
          cpf: null,
          status: 'not_found',
          alternates: [],
          score: 0
        });
        continue;
      }

      const qNorm = normalizeName(rawName);
      const qTokens = getTokens(qNorm);

      if (qTokens.length === 0) {
        enrichedResults.push({
          originalName: rawName,
          enrichedName: null,
          cpf: null,
          status: 'not_found',
          alternates: [],
          score: 0
        });
        continue;
      }

      const ftsQuery = buildFtsQuery(rawName);
      let dbCandidates: any[] = [];

      if (ftsQuery) {
        const dbRes = await pool.query(
          `SELECT nome, cpf, nome_normalizado FROM pessoas WHERE to_tsvector('simple', nome_normalizado) @@ to_tsquery('simple', $1) LIMIT 100`,
          [ftsQuery]
        );
        dbCandidates = dbRes.rows;
      } else {
        const likeQueries = qTokens.map((t, idx) => `nome_normalizado LIKE $${idx + 1}`);
        const likeParams = qTokens.map(t => `%${t}%`);
        const dbRes = await pool.query(
          `SELECT nome, cpf, nome_normalizado FROM pessoas WHERE ${likeQueries.join(' AND ')} LIMIT 50`,
          likeParams
        );
        dbCandidates = dbRes.rows;
      }

      const matchedResults = dbCandidates
        .map(candidate => {
          const cTokens = getTokens(candidate.nome_normalizado);
          const matchResult = matchTokens(qTokens, cTokens);
          return {
            nome: candidate.nome,
            cpf: candidate.cpf,
            score: matchResult.score,
            isMatch: matchResult.isMatch
          };
        })
        .filter(r => r.isMatch)
        .sort((a, b) => b.score - a.score);

      if (matchedResults.length === 0) {
        enrichedResults.push({
          originalName: rawName,
          enrichedName: null,
          cpf: null,
          status: 'not_found',
          alternates: [],
          score: 0
        });
      } else {
        const primary = matchedResults[0];
        const alternates: string[] = [];
        let status: 'success' | 'ambiguous' = 'success';

        for (let i = 1; i < matchedResults.length; i++) {
          const alt = matchedResults[i];
          if (alt.score >= 0.70) {
            alternates.push(`${alt.nome} (${alt.cpf})`);
            if (primary.score - alt.score < 0.05) {
              status = 'ambiguous';
            }
          }
        }

        enrichedResults.push({
          originalName: rawName,
          enrichedName: primary.nome,
          cpf: primary.cpf,
          status,
          alternates,
          score: primary.score
        });
      }
    }

    const elapsedMs = Date.now() - startTime;
    res.json({
      processedCount: names.length,
      elapsedMs,
      results: enrichedResults
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Truncate/Clear database table
 * POST /api/pessoas/clear
 */
router.post('/pessoas/clear', async (req: Request, res: Response) => {
  try {
    await pool.query('TRUNCATE TABLE pessoas RESTART IDENTITY');
    res.json({ success: true, message: 'Database table cleared successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
