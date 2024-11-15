const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache to store the jokes
let jokesCache = {
  data: [],
  lastUpdated: null,
  isValid: false
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://pokemon-quey.onrender.com']
}));
app.use(express.static(path.join(_dirname, "/frontend/dist")));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Function to check if cache is valid
const isCacheValid = () => {
  return jokesCache.isValid &&
    jokesCache.lastUpdated &&
    (Date.now() - jokesCache.lastUpdated) < CACHE_DURATION;
};

// Function to update cache
const updateCache = (data) => {
  jokesCache = {
    data: data,
    lastUpdated: Date.now(),
    isValid: true
  };
};

// Function to fetch jokes from database
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const fetchJokesFromDB = async () => {
  let retries = 0;
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
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  throw new Error('Unable to connect to the database after multiple retries');
};
// Main route handler for jokes
app.get('/post', async (req, res) => {
  try {
    // First check if we have valid cached data
    if (isCacheValid()) {
      console.log('Serving from cache');
      return res.json(jokesCache.data);
    }

    // If cache is invalid or expired, try to fetch from database
    const jokes = await fetchJokesFromDB();
    updateCache(jokes);

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.json(jokes);
  } catch (error) {
    console.error('Error fetching jokes:', error);

    // If database is down but we have cached data (even if expired), use it
    if (jokesCache.data.length > 0) {
      console.log('Database error, serving stale cache');
      res.set('Cache-Control', 'public, max-age=60'); // Shorter cache time for stale data
      return res.json(jokesCache.data);
    }

    // If we have no cached data, return error
    if (error.message === 'Error connecting to the database') {
      res.status(503).json({
        error: 'Database connection error',
        message: 'The database is currently unavailable. Please try again later.'
      });
    } else if (error.message === 'Error fetching data from the database') {
      res.status(503).json({
        error: 'Database query error',
        message: 'There was an issue fetching data from the database. Please try again later.'
      });
    } else {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Please try again later'
      });
    }
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
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
