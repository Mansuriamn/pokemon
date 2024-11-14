const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const useragent = require('express-useragent');
const compression = require('compression');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache with separate mobile and desktop versions
let jokesCache = {
  mobile: {
    data: [],
    lastUpdated: null,
    isValid: false
  },
  desktop: {
    data: [],
    lastUpdated: null,
    isValid: false
  }
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(useragent.express());
app.use(compression()); // Compress responses
app.use(express.static(path.join(_dirname, "/frontend/dist"), {
  maxAge: '1h' // Cache static files for 1 hour
}));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'joke',
  connectTimeout: 10000, // 10 second timeout
  waitForConnections: true,
  queueLimit: 0
});

// Function to check if cache is valid
const isCacheValid = (deviceType) => {
  return jokesCache[deviceType].isValid && 
         jokesCache[deviceType].lastUpdated && 
         (Date.now() - jokesCache[deviceType].lastUpdated) < CACHE_DURATION;
};

// Function to update cache
const updateCache = (data, deviceType) => {
  jokesCache[deviceType] = {
    data: data,
    lastUpdated: Date.now(),
    isValid: true
  };
};

// Function to optimize data for mobile
const optimizeForMobile = (jokes) => {
  return jokes.map(joke => ({
    id: joke.id,
    title: joke.title,
    content: joke.content.substring(0, 100) + (joke.content.length > 100 ? '...' : ''),
    // Include only essential fields for mobile
    timestamp: joke.timestamp
  }));
};

// Function to fetch jokes from database
const fetchJokesFromDB = async (limit = null) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection:', err);
        reject(err);
        return;
      }

      let query = 'SELECT * FROM jokes';
      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      connection.query(query, (error, results) => {
        connection.release();
        
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
  });
};

// Main route handler for jokes with device detection
app.get('/post', async (req, res) => {
  const deviceType = req.useragent.isMobile ? 'mobile' : 'desktop';
  const page = parseInt(req.query.page) || 1;
  const limit = deviceType === 'mobile' ? 10 : 20; // Fewer items for mobile
  
  try {
    // Check for valid cached data
    if (isCacheValid(deviceType)) {
      console.log(`Serving from ${deviceType} cache`);
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedData = jokesCache[deviceType].data.slice(start, end);
      
      return res.json({
        data: paginatedData,
        page,
        totalPages: Math.ceil(jokesCache[deviceType].data.length / limit)
      });
    }

    // Fetch from database
    let jokes = await fetchJokesFromDB();

    // Optimize data based on device type
    if (deviceType === 'mobile') {
      jokes = optimizeForMobile(jokes);
    }

    // Update cache
    updateCache(jokes, deviceType);
    
    // Implement pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedData = jokes.slice(start, end);

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      data: paginatedData,
      page,
      totalPages: Math.ceil(jokes.length / limit)
    });

  } catch (error) {
    console.error('Error fetching jokes:', error);
    
    // Serve stale cache if available
    if (jokesCache[deviceType].data.length > 0) {
      console.log(`Database error, serving stale ${deviceType} cache`);
      res.set('Cache-Control', 'public, max-age=60');
      const start = (page - 1) * limit;
      const end = start + limit;
      return res.json({
        data: jokesCache[deviceType].data.slice(start, end),
        page,
        totalPages: Math.ceil(jokesCache[deviceType].data.length / limit),
        fromStaleCache: true
      });
    }

    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later'
    });
  }
});

// API health check endpoint
app.get('/health', (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }
    
    connection.release();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later',
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for frontend
app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});