const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const NodeCache = require('node-cache'); // You'll need to install this: npm install node-cache

dotenv.config();

const _dirname = path.resolve();
const app = express();

// Initialize cache with 1 hour default TTL
const cache = new NodeCache({ stdTTL: 3600 });

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(express.static(path.join(_dirname, "/frontend/dist")));

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'joke',
  connectTimeout: 10000,
  acquireTimeout: 10000
});

// Enhanced error handling middleware with cache fallback
const handleDatabaseError = (err, req, res, next) => {
  console.error('Database error:', err);
  
  // Try to serve cached data if available
  const cachedData = cache.get('jokes');
  if (cachedData) {
    console.log('Serving cached data due to database error');
    return res.json({
      data: cachedData,
      source: 'cache',
      timestamp: new Date().toISOString()
    });
  }
  
  res.status(503).json({
    error: 'Database service temporarily unavailable',
    message: 'Please try again later'
  });
};

// Middleware to check cache before hitting database
const checkCache = (req, res, next) => {
  const cachedData = cache.get('jokes');
  
  if (cachedData) {
    console.log('Serving from cache');
    return res.json({
      data: cachedData,
      source: 'cache',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

app.get('/post', checkCache, (req, res, next) => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Error getting database connection:', err);
      return next(err);
    }

    connection.query('SELECT * FROM jokes', (error, results) => {
      connection.release();
      
      if (error) {
        return next(error);
      }
      
      // Store in cache
      cache.set('jokes', results);
      
      // Set cache headers for browsers/CDNs
      res.set({
        'Cache-Control': 'public, max-age=300, stale-if-error=86400',
        'Surrogate-Control': 'max-age=86400',
        'ETag': require('crypto').createHash('md5').update(JSON.stringify(results)).digest('hex')
      });
      
      res.json({
        data: results,
        source: 'database',
        timestamp: new Date().toISOString()
      });
    });
  });
});

// Endpoint to manually clear cache if needed
app.post('/clear-cache', (req, res) => {
  cache.flushAll();
  res.json({ message: 'Cache cleared successfully' });
});

app.use(handleDatabaseError);

app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port http://localhost:${port}`);
});