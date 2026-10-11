import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow text-center">
        <h1 className="text-4xl mb-4 text-blue-600 font-bold">Welcome to OpsMind</h1>
        <p className="text-xl mb-6">Hello, {user?.name}!</p>
        <button onClick={logout} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
          Logout
        </button>
      </div>
    </div>
  );
};

export default Home;
