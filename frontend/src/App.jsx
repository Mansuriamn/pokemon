// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import './App.css';

// export default function App() {
//   const [dt, setDt] = useState([]);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [error, setError] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [isOnline, setIsOnline] = useState(navigator.onLine);

//   // Initialize data from localStorage immediately
//   useEffect(() => {
//     const cachedData = localStorage.getItem('cachedJokes');
//     if (cachedData) {
//       setDt(JSON.parse(cachedData));
//       setLoading(false);
//     }
//   }, []);

//   // Handle online/offline status
//   useEffect(() => {
//     const handleOnline = () => {
//       setIsOnline(true);
//       setError(null);
//       fetchData();
//     };

//     const handleOffline = () => {
//       setIsOnline(false);
//       setError('You are currently offline. Showing cached data.');
//     };

//     window.addEventListener('online', handleOnline);
//     window.addEventListener('offline', handleOffline);

//     // Initial fetch if online
//     if (navigator.onLine) {
//       fetchData();
//     }

//     return () => {
//       window.removeEventListener('online', handleOnline);
//       window.removeEventListener('offline', handleOffline);
//     };
//   }, []);

//   const fetchData = async () => {
//     try {
//       const response = await axios.get('http://localhost:4000/post', {
//         timeout: 5000,
//         headers: {
//           'Cache-Control': 'no-cache',
//           'Pragma': 'no-cache'
//         }
//       });

//       if (response.data && response.data.length > 0) {
//         // Update state and cache
//         setDt(response.data);
//         localStorage.setItem('cachedJokes', JSON.stringify(response.data));
//         setError(null);
//       }
//     } catch (err) {
//       console.error('Error fetching data:', err);
//       const cachedData = localStorage.getItem('cachedJokes');
      
//       if (cachedData && dt.length === 0) {
//         setDt(JSON.parse(cachedData));
//         setError('Unable to fetch new data. Showing cached data.');
//       } else if (!cachedData && dt.length === 0) {
//         setError('No data available. Please check your connection and try again.');
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleNextJoke = () => {
//     setCurrentIndex((prevIndex) => (prevIndex + 1) % dt.length);
//   };

//   if (loading && dt.length === 0) {
//     return (
//       <div className="flex items-center justify-center p-4">
//         <p>Loading...</p>
//       </div>
//     );
//   }

//   return (
//     <div className="p-4">
//       {error && (
//         <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
//           {error}
//         </div>
//       )}
//       {!isOnline && (
//         <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4">
//           You are currently offline
//         </div>
//       )}

//       {dt.length > 0 ? (
//         <div className="container">
//           <h2 className="text-xl font-bold">{dt[currentIndex].title}</h2>
//           <p className="mt-2">{dt[currentIndex].body}</p>
//         </div>
//       ) : (
//         <div className="text-center p-4">
//           <p>No data available</p>
//         </div>
//       )}

//       <button 
//         onClick={handleNextJoke} 
//         className="btn" 
//         id="jokeBtn"
//         disabled={dt.length === 0}
//       >
//         Next joke 😂😂
//       </button>
//     </div>
//   );
// }


import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// Constants
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const CACHE_KEY = 'cachedJokes';
const CACHE_TIMESTAMP_KEY = 'jokeCacheTimestamp';
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export default function App() {
  const [dt, setDt] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryCount, setRetryCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;
    return Date.now() - parseInt(timestamp, 10) < CACHE_DURATION;
  }, []);

  // Update cache with new data
  const updateCache = useCallback((data) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      console.error('Error updating cache:', err);
    }
  }, []);

  // Load data from cache
  const loadFromCache = useCallback(() => {
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setDt(parsedData);
        return true;
      }
    } catch (err) {
      console.error('Error loading from cache:', err);
    }
    return false;
  }, []);

  // Fetch data with retry mechanism
  const fetchData = useCallback(async (isRetry = false) => {
    if (!navigator.onLine) {
      setError('You are offline. Showing cached data.');
      loadFromCache();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/post`, {
        timeout: 10000, // Increased timeout for mobile
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        // Add retry and timeout configurations
        retry: 3,
        retryDelay: 1000,
        validateStatus: status => status === 200
      });

      if (response.data && response.data.length > 0) {
        setDt(response.data);
        updateCache(response.data);
        setError(null);
        setRetryCount(0);
      } else {
        throw new Error('No data received from server');
      }
    } catch (err) {
      console.error('Error fetching data:', err);

      // Handle different types of errors
      if (err.code === 'ECONNABORTED') {
        setError('Connection timeout. Please check your internet connection.');
      } else if (err.response) {
        setError(`Server error: ${err.response.status}`);
      } else if (err.request) {
        setError('No response from server. Please try again.');
      } else {
        setError('Error loading data. Please try again.');
      }

      // Retry logic
      if (!isRetry && retryCount < 3) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchData(true), 2000 * (retryCount + 1));
      }

      // Fallback to cache
      if (!loadFromCache()) {
        setError('No cached data available. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadFromCache, updateCache, retryCount]);

  // Initialize data and handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setError('You are offline. Showing cached data.');
      loadFromCache();
    };

    // Load cached data immediately
    loadFromCache();

    // Set up network status listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial fetch if online
    if (navigator.onLine) {
      if (!isCacheValid()) {
        fetchData();
      } else {
        setLoading(false);
      }
    } else {
      handleOffline();
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData, loadFromCache, isCacheValid]);

  const handleNextJoke = useCallback(() => {
    setCurrentIndex(prevIndex => (prevIndex + 1) % dt.length);
  }, [dt.length]);

  // Manual refresh function
  const handleRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (loading && dt.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading jokes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Status Messages */}
      {error && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 rounded shadow">
          <p className="font-bold">Notice</p>
          <p>{error}</p>
        </div>
      )}
      
      {!isOnline && (
        <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4 rounded shadow">
          <p className="font-bold">Offline Mode</p>
          <p>You are currently offline. Some features may be limited.</p>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-lg mx-auto bg-white rounded-lg shadow-lg p-6">
        {dt.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-4">{dt[currentIndex].title}</h2>
            <p className="text-gray-700 mb-6">{dt[currentIndex].body}</p>
            
            <div className="flex flex-col space-y-4">
              <button 
                onClick={handleNextJoke}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-200"
                disabled={dt.length === 0}
              >
                Next Joke 😂
              </button>
              
              <button 
                onClick={handleRefresh}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-200"
                disabled={loading || !isOnline}
              >
                {loading ? 'Refreshing...' : 'Refresh Jokes 🔄'}
              </button>
            </div>

            {lastUpdated && (
              <p className="text-sm text-gray-500 mt-4">
                Last updated: {lastUpdated}
              </p>
            )}
          </>
        ) : (
          <div className="text-center p-4">
            <p className="text-gray-700">No jokes available</p>
            <button 
              onClick={handleRefresh}
              className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-200"
              disabled={loading || !isOnline}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}