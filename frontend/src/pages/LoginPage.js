import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';
import { loginAccount } from '../controllers/AccountController';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);

  // Mock database of users
  const users = [
    { firstName: 'John', lastName: 'x', email: 'student@example.com', password: 'password1', birthday: '', major: 'Computer Science', language: 'English', isTutor: false, isAdmin: false, notifications: true, proofdoc: null, isApproved: true, },
    { firstName: 'Mark', lastName: 'y', email: 'tutor@example.com', password: 'password2', birthday: '', major: 'Computer Science', language: 'English', isTutor: true, isAdmin: false, notifications: true, proofdoc: null, isApproved: true, },
    { firstName: 'Tim', lastName: 'z', email: 'admin@example.com', password: 'password3', birthday: '', major: '', language: 'English', isTutor: false, notifications: true, isAdmin: true, proofdoc: null, courses: [], isApproved: true, },
  ];


  const handleLogin = async (event) => {
    event.preventDefault();
    let user = await loginAccount(email, password);
    if (user) {
      if (user.isAdmin) {
        navigate('/adminPortal');
      } else {
        if (user.student) {
          navigate('/userPortal', { state: { user: user, isTutor: false } });
        }
        if (user.tutor) {
          console.log("Is this going to the tutor portal?");
          navigate('/tutorPortal', { state: { user: user, isTutor: true } });
        }
      }
    } else {
      setError('Invalid email or password');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const demo = String(params.get('demo') || '').toLowerCase();
    if (demo !== 'student' && demo !== 'tutor') return;

    let cancelled = false;
    setDemoLoading(true);
    setError('');

    const run = async () => {
      try {
        const res = await fetch(demo === 'tutor' ? '/api/demo/tutor' : '/api/demo/student');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || 'Demo login failed');
        }
        if (cancelled) return;

        if (demo === 'tutor') {
          navigate('/tutorPortal', { state: { user: data, isTutor: true } });
        } else {
          navigate('/userPortal', { state: { user: data, isTutor: false } });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Demo login failed');
      } finally {
        if (cancelled) return;
        setDemoLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  return (
    <div className="login-container">
      <div className="login-box">
        <button
          type="button"
          className="auth-back-button"
          onClick={() => navigate('/')}
          aria-label="Back to home"
        >
          &larr;
        </button>
        <h2>Login to Tutor Connect</h2>
        {demoLoading && <p>Logging you in...</p>}
        {error && <p className="login-error">{error}</p>}
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            className="login-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="login-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="login-btn">Sign In</button>
        </form>
        <div className="login-links">
          <p><Link to="/register" className="link">Register for a new account</Link></p>
          <p><Link to="/" className="link">Forgot Password</Link></p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
