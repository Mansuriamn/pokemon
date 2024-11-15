const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache setup
let jokesCache = {
  data: [],
  lastUpdated: null,
  isValid: false
};

const CACHE_DURATION = 5 * 60 * 1000;

// Updated CORS configuration
app.use(cors({
  origin: ['https://Aman-localhost.onrender.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(_dirname, "/frontend/dist")));

// Database connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Cache functions
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

// Database fetch function with retry logic
const fetchJokesFromDB = async () => {
  let retries = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  while (retries < MAX_RETRIES) {
    try {
      return await new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
          if (err) {
            console.error('Error getting database connection:', err);
            reject(new Error('Error connecting to the database'));
            return;
          }

          connection.query('SELECT * FROM jokes', (error, results) => {
            connection.release();

            if (error) {
              console.error('Error fetching jokes from the database:', error);
              reject(new Error('Error fetching data from the database'));
              return;
            }

            resolve(results);
          });
        });
      });
    } catch (error) {
      retries++;
      console.error(`Database connection error, retrying (attempt ${retries}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }

  throw new Error('Unable to connect to the database after multiple retries');
};

// API Routes
app.get('/post', async (req, res) => {
  // Set CORS headers explicitly for this route
  res.header('Access-Control-Allow-Origin', 'https://help-joke.onrender.com');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Cache-Control, Pragma');
  
  try {
    if (isCacheValid()) {
      console.log('Serving from cache');
      return res.json(jokesCache.data);
    }

    const jokes = await fetchJokesFromDB();
    updateCache(jokes);
    
    res.set('Cache-Control', 'public, max-age=300');
    res.json(jokes);
  } catch (error) {
    console.error('Error in /post route:', error);

    if (jokesCache.data.length > 0) {
      console.log('Database error, serving stale cache');
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(jokesCache.data);
    }

    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later'
  });
});

// Catch-all route for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(_dirname, 'frontend', 'dist', 'index.html'));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port http://localhost:${port}`);
});