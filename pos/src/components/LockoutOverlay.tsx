import React, { useEffect } from 'react';

const LockoutOverlay: React.FC = () => {
  // Block ESC key and any keyboard-driven dismissal
  useEffect(() => {
    const blockKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', blockKeydown, true);
    return () => window.removeEventListener('keydown', blockKeydown, true);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .lockout-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 9999;
          pointer-events: all;
          background: rgba(10, 10, 15, 0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .lockout-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 48px 40px 40px;
          max-width: 440px;
          width: calc(100% - 48px);
          text-align: center;
          box-shadow:
            0 0 0 1px rgba(220, 38, 38, 0.15),
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 32px 64px rgba(0, 0, 0, 0.3);
          animation: lockout-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        @keyframes lockout-appear {
          from {
            opacity: 0;
            transform: scale(0.88) translateY(16px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .lockout-icon-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          border: 3px solid #fca5a5;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 36px;
          animation: lockout-pulse 2.5s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
        }

        @keyframes lockout-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
          50%       { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
        }

        .lockout-badge {
          display: inline-block;
          background: #dc2626;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 100px;
          margin-bottom: 12px;
        }

        .lockout-heading {
          font-size: 26px;
          font-weight: 800;
          color: #dc2626;
          letter-spacing: -0.02em;
          margin: 0 0 16px;
          line-height: 1.2;
        }

        .lockout-divider {
          width: 48px;
          height: 3px;
          background: linear-gradient(90deg, #dc2626, #b91c1c);
          border-radius: 2px;
          margin: 0 auto 20px;
        }

        .lockout-message {
          font-size: 14.5px;
          color: #374151;
          line-height: 1.7;
          margin: 0 0 28px;
        }

        .lockout-message strong {
          color: #111827;
          font-weight: 600;
        }

        .lockout-info-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 28px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          text-align: left;
        }

        .lockout-info-box-icon {
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .lockout-info-box-text {
          font-size: 13px;
          color: #991b1b;
          line-height: 1.6;
          font-weight: 500;
        }



        .lockout-footer {
          margin-top: 20px;
          font-size: 12px;
          color: #9ca3af;
        }
      `}</style>

      <div className="lockout-overlay" onClick={e => e.stopPropagation()}>
        <div className="lockout-card">
          <div className="lockout-icon-ring">🔒</div>

          <span className="lockout-badge">Account Suspended</span>

          <h1 className="lockout-heading">SERVICE SUSPENDED</h1>

          <div className="lockout-divider" />

          <p className="lockout-message">
            Your account has been <strong>locked</strong> due to an{' '}
            <strong>overdue payment</strong>. All access to this
            application is currently restricted.
          </p>

          <div className="lockout-info-box">
            <span className="lockout-info-box-icon">ℹ️</span>
            <span className="lockout-info-box-text">
              To restore access, please contact your service provider with
              proof of payment. Your data remains safe and intact.
            </span>
          </div>



          <p className="lockout-footer">
            Do not close this window — contact support to regain access.
          </p>
        </div>
      </div>
    </>
  );
};

export default LockoutOverlay;
