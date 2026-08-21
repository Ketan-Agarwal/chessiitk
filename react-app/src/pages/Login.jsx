import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { getRecaptchaToken } from '../utils/recaptcha';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); // Added to show incorrect password messages
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/'); 
    }
  }, [isLoggedIn, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const recaptchaToken = await getRecaptchaToken('login');
      // Talk to your local Python backend
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email : email,
          username: email, // Python is looking for 'username', so we pass the email state here
          password: password,
          recaptcha_token: recaptchaToken
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to login');
      } else {
        
        
        // 2. Grab the token safely
        const theToken = data.token;
        

        
        localStorage.setItem('chess-club-jwt', theToken);
        localStorage.setItem('chess-club-role', data.role); // <-- This tells React if they are a secretary!
        localStorage.setItem('logged_in_user_email', email);
        // 4. Log in and redirect
        login(theToken); 

        navigate('/'); 
      }
    } catch (err) {
      console.error("Login Error:", err);
      setError(err.message || 'Cannot connect to the server. Is your Python backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]"></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10 bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 shadow-2xl">
        <div>
          <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant/20 shadow-inner mb-6">
            <span className="material-symbols-outlined text-3xl text-primary font-light">lock</span>
          </div>
          <h2 className="text-center text-3xl font-serif font-bold tracking-tight text-on-surface">
            Sign In
          </h2>
          <p className="mt-3 text-center text-sm text-on-surface-variant/80">
            Log in with your IITK credentials to manage your profile and register for upcoming tournaments
          </p>
        </div>

        {/* Display error messages right above the form */}
        {error && (
          <div className="text-red-500 text-sm text-center font-semibold bg-red-500/10 p-3 rounded-lg">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-5 rounded-md shadow-sm">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2 ml-1" htmlFor="email-address">Email Address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:z-10 sm:text-sm transition-colors"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2 ml-1" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-3.5 pr-12 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:z-10 sm:text-sm transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary transition-colors focus:outline-none z-20"
                  aria-label="Toggle password visibility"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              
              {/* --- FORGOT PASSWORD LINK ADDED HERE --- */}
              <div className="flex justify-end mt-2 mb-4">
                <Link to="/forgot-password" className="text-xs font-bold text-primary hover:underline transition-all">
                  Forgot your password?
                </Link>
              </div>
              {/* --------------------------------------- */}

            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-on-primary bg-primary hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(242,202,80,0.3)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-surface transition-all duration-300"
            >
              {isLoading ? 'Verifying...' : 'Sign In'}
            </button>
            <p className="text-center text-sm text-on-surface-variant mt-4">
              Don't have an account?{' '}
              <Link to="/signup" className="font-bold text-primary hover:underline transition-all">
                Sign Up
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
