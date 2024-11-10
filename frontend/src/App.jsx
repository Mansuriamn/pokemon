import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

export default function App() {
  const [dt, setDt] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Initialize data from localStorage immediately
  useEffect(() => {
    const cachedData = localStorage.getItem('cachedJokes');
    if (cachedData) {
      setDt(JSON.parse(cachedData));
      setLoading(false);
    }
  }, []);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      fetchData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setError('You are currently offline. Showing cached data.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial fetch if online
    if (navigator.onLine) {
      fetchData();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = async () => {
    try {
      const response = await axios.get('http://localhost:4000/post', {
        timeout: 5000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (response.data && response.data.length > 0) {
        // Update state and cache
        setDt(response.data);
        localStorage.setItem('cachedJokes', JSON.stringify(response.data));
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      const cachedData = localStorage.getItem('cachedJokes');
      
      if (cachedData && dt.length === 0) {
        setDt(JSON.parse(cachedData));
        setError('Unable to fetch new data. Showing cached data.');
      } else if (!cachedData && dt.length === 0) {
        setError('No data available. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNextJoke = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % dt.length);
  };

  if (loading && dt.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {error && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
          {error}
        </div>
      )}
      {!isOnline && (
        <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4">
          You are currently offline
        </div>
      )}

      {dt.length > 0 ? (
        <div className="container">
          <h2 className="text-xl font-bold">{dt[currentIndex].title}</h2>
          <p className="mt-2">{dt[currentIndex].body}</p>
        </div>
      ) : (
        <div className="text-center p-4">
          <p>No data available</p>
        </div>
      )}

      <button 
        onClick={handleNextJoke} 
        className="btn" 
        id="jokeBtn"
        disabled={dt.length === 0}
      >
        Next joke 😂😂
      </button>
    </div>
  );
}