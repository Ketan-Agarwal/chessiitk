import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { getRecaptchaToken } from '../utils/recaptcha';

const ForgotPassword = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleSendResetCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const recaptchaToken = await getRecaptchaToken('forgot_password');
      const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, recaptcha_token: recaptchaToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send reset code');
      } else {
        setSuccess('Reset code sent to your email!');
        setStep(2);
      }
    } catch (err) {
      setError(err.message || 'Cannot connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email, 
          otp: otp,
          new_password: newPassword
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
      } else {
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      setError('Cannot connect to the server.');
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
            <span className="material-symbols-outlined text-3xl text-primary font-light">
              {step === 1 ? 'key' : 'password'}
            </span>
          </div>
          <h2 className="text-center text-3xl font-serif font-bold tracking-tight text-on-surface">
            Reset Password
          </h2>
        </div>

        {error && <div className="text-red-500 text-sm text-center font-semibold bg-red-500/10 p-3 rounded-lg">{error}</div>}
        {success && <div className="text-green-500 text-sm text-center font-semibold bg-green-500/10 p-3 rounded-lg">{success}</div>}

        {step === 1 && (
          <form className="mt-8 space-y-6" onSubmit={handleSendResetCode}>
            <div className="space-y-5 rounded-md shadow-sm">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2 ml-1">Account Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-3.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                  placeholder="student@iitk.ac.in"
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all duration-300"
              >
                {isLoading ? 'Searching...' : 'Send Reset Code'}
              </button>
              <p className="text-center text-sm text-on-surface-variant mt-4">
                Remembered it? <Link to="/login" className="font-bold text-primary hover:underline">Sign In</Link>
              </p>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
            <div className="space-y-5 rounded-md shadow-sm">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2 ml-1">6-Digit Code</label>
                <input
                  type="text"
                  maxLength="6"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-3.5 border border-outline-variant/20 bg-surface-container-lowest text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm text-center tracking-[0.5em] font-mono text-xl"
                  placeholder="123456"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2 ml-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-3.5 pr-12 border border-outline-variant/20 bg-surface-container-lowest text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary focus:outline-none z-20"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all duration-300"
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
