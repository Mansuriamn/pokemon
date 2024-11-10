const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');

dotenv.config();

const _dirname = path.resolve();
const app = express();

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
  connectTimeout: 10000, // 10 seconds
  acquireTimeout: 10000
});

// Enhanced error handling middleware
const handleDatabaseError = (err, req, res, next) => {
  console.error('Database error:', err);
  
  // Set appropriate cache headers to allow stale content
  res.set({
    'Cache-Control': 'public, max-age=300, stale-if-error=86400',
    'Surrogate-Control': 'max-age=86400'
  });
  
  res.status(503).json({
    error: 'Database service temporarily unavailable',
    message: 'Please try again later',
    cached: true
  });
};

app.get('/post', (req, res, next) => {
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
      
      // Set cache headers
      res.set({
        'Cache-Control': 'public, max-age=300, stale-if-error=86400',
        'Surrogate-Control': 'max-age=86400',
        'ETag': require('crypto').createHash('md5').update(JSON.stringify(results)).digest('hex')
      });
      
      res.json(results);
    });
  });
});

app.use(handleDatabaseError);

app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port http://localhost:${port}`);
});