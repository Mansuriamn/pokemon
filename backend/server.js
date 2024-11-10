


const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache
let jokesCache = {
  data: [],
  lastUpdated: null,
  isValid: false
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// CORS configuration for mobile access
const corsOptions = {
  origin: '*', // Allow all origins
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(express.static(path.join(_dirname, "/frontend/dist")));

// Enhanced database connection pool configuration
const pool = mysql.createPool({
  connectionLimit: 100, // Increased for better concurrency
  connectTimeout: 60000, // Increased timeout (60 seconds)
  acquireTimeout: 60000,
  timeout: 60000,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'joke',
  port: process.env.DB_PORT || 3306, // Explicitly set database port
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false // For development - adjust for production
  } : false,
  debug: process.env.NODE_ENV !== 'production',
  waitForConnections: true,
  queueLimit: 0
});

// Database connection check
const checkDatabaseConnection = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Database connection failed:', err);
        reject(err);
        return;
      }
      connection.ping((pingErr) => {
        connection.release();
        if (pingErr) {
          reject(pingErr);
        } else {
          resolve();
        }
      });
    });
  });
};

// Periodic database connection check
setInterval(async () => {
  try {
    await checkDatabaseConnection();
    console.log('Database connection is healthy');
  } catch (error) {
    console.error('Database connection check failed:', error);
  }
}, 30000); // Check every 30 seconds

// Cache management functions
const isCacheValid = () => {
  return jokesCache.isValid && 
         jokesCache.lastUpdated && 
         (Date.now() - jokesCache.lastUpdated) < CACHE_DURATION;
};

const updateCache = (data) => {
  jokesCache = {
    data: data,
    lastUpdated: Date.now(),
    isValid: true
  };
};

// Enhanced database query function with retries
const fetchJokesFromDB = (retries = 3) => {
  return new Promise((resolve, reject) => {
    const attemptFetch = (retriesLeft) => {
      pool.getConnection((err, connection) => {
        if (err) {
          console.error(`Database connection error (${retriesLeft} retries left):`, err);
          if (retriesLeft > 0) {
            setTimeout(() => attemptFetch(retriesLeft - 1), 1000);
            return;
          }
          reject(err);
          return;
        }

        connection.query('SELECT * FROM jokes', (error, results) => {
          connection.release();
          
          if (error) {
            console.error(`Query error (${retriesLeft} retries left):`, error);
            if (retriesLeft > 0) {
              setTimeout(() => attemptFetch(retriesLeft - 1), 1000);
              return;
            }
            reject(error);
            return;
          }

          resolve(results);
        });
      });
    };

    attemptFetch(retries);
  });
};

// Modified route handler with better mobile support
app.get('/post', async (req, res) => {
  // Set headers for better mobile compatibility
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300'
  });

  try {
    // First check cache
    if (isCacheValid()) {
      console.log('Serving from cache');
      return res.json(jokesCache.data);
    }

    // Try database with retries
    const jokes = await fetchJokesFromDB();
    updateCache(jokes);
    res.json(jokes);

  } catch (error) {
    console.error('Error fetching jokes:', error);
    
    // Fallback to cache if available
    if (jokesCache.data.length > 0) {
      console.log('Database error, serving stale cache');
      return res.json(jokesCache.data);
    }

    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await checkDatabaseConnection();
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      cache: jokesCache.isValid ? 'available' : 'unavailable'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Frontend route
app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Server is in ${process.env.NODE_ENV || 'development'} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end((err) => {
    if (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(err ? 1 : 0);
  });
});