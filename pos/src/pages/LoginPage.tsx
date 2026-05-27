import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div className="login-container">
      <div className="login-glass">
        <div className="login-header">
          <div className="logo-pulse">
            <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="logo-icon">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <h1>Ganewa POs</h1>
          <p>Inventory & Sales Specialist</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              name="username_ganewa"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password_ganewa"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="new-password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            {loading ? (
              <span className="loader"></span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>&copy; Afrahab Solutions 08074741411, 08138012494</p>
        </div>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top left, var(--slate-800, #1e293b), var(--slate-900, #0f172a));
          overflow: hidden;
          position: relative;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .login-container::before {
          content: '';
          position: absolute;
          width: 300px;
          height: 300px;
          background: rgba(30, 64, 175, 0.2);
          filter: blur(80px);
          top: -100px;
          right: -100px;
          border-radius: 50%;
        }

        .login-container::after {
          content: '';
          position: absolute;
          width: 400px;
          height: 400px;
          background: rgba(59, 130, 246, 0.1);
          filter: blur(100px);
          bottom: -150px;
          left: -150px;
          border-radius: 50%;
        }

        .login-glass {
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 3rem;
          border-radius: 1.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          z-index: 10;
          animation: slideUp 0.6s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .logo-pulse {
          display: inline-flex;
          padding: 1rem;
          background: linear-gradient(135deg, var(--blue-500, #3b82f6), var(--blue-600, #2563eb));
          border-radius: 1rem;
          color: white;
          margin-bottom: 1rem;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
          animation: pulse 3s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        .login-header h1 {
          color: white;
          font-size: 1.875rem;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.025em;
        }

        .login-header p {
          color: var(--slate-400, #94a3b8);
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .login-form .input-group {
          margin-bottom: 1.5rem;
        }

        .login-form label {
          display: block;
          color: var(--slate-200, #e2e8f0);
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .login-form input {
          width: 100%;
          background: white !important;
          border: 1px solid var(--slate-300, #cbd5e1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: black !important;
          transition: all 0.2s;
          outline: none;
        }

        .login-form input::placeholder {
          color: #94a3b8;
        }

        .login-form input:focus {
          border-color: var(--blue-500, #3b82f6);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
          background: white !important;
        }

        /* Prevent Chrome Autofill Background Color */
        .login-form input:-webkit-autofill,
        .login-form input:-webkit-autofill:hover, 
        .login-form input:-webkit-autofill:focus {
          -webkit-text-fill-color: black !important;
          -webkit-box-shadow: 0 0 0px 1000px white inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border-left: 4px solid var(--red-500, #ef4444);
          color: var(--red-300, #fca5a5);
          padding: 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
          animation: shake 0.4s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .login-button {
          width: 100%;
          background: linear-gradient(135deg, var(--blue-500, #3b82f6), var(--blue-600, #2563eb));
          color: white;
          border: none;
          border-radius: 0.75rem;
          padding: 0.875rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
          filter: brightness(1.1);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .loader {
          width: 20px;
          height: 20px;
          border: 2px solid white;
          border-bottom-color: transparent;
          border-radius: 50%;
          display: inline-block;
          animation: rotation 1s linear infinite;
        }

        @keyframes rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .login-footer {
          margin-top: 2rem;
          text-align: center;
          color: var(--slate-500, #64748b);
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
