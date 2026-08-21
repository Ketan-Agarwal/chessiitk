import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { getRecaptchaToken } from '../utils/recaptcha';

const Signup = () => {
  const [mode, setMode] = useState('student'); // 'student' or 'alumni'
  const [step, setStep] = useState(1); // Tracks which form to show
  
  // Form Data (Student)
  const [email, setEmail] = useState('');
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [chessUsername, setChessUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [primaryOtp, setPrimaryOtp] = useState('');
  const [secondaryOtp, setSecondaryOtp] = useState('');

  // Profile Fields (Shared)
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [contact, setContact] = useState('');
  const [gender, setGender] = useState('');

  // Alumni Specific Fields
  const [alumniGradYear, setAlumniGradYear] = useState('');
  const [alumniNotes, setAlumniNotes] = useState('');
  const [alumniSubmitted, setAlumniSubmitted] = useState(false);
  
  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  // --- STEP 1: Send the OTP (Student) ---
  const handleSendDualOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!gender) {
      setError("Please select your gender.");
      setIsLoading(false);
      return;
    }

    const isIITK = (m) => m.toLowerCase().endsWith('@iitk.ac.in');
    const isValidIITK = (m) => /\d{2}@iitk\.ac\.in$/i.test(m.trim());

    if (isIITK(email) && !isValidIITK(email)) {
      setError("IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in).");
      setIsLoading(false);
      return;
    }
    if (isIITK(secondaryEmail) && !isValidIITK(secondaryEmail)) {
      setError("Secondary IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in).");
      setIsLoading(false);
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError("Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one special character.");
      setIsLoading(false);
      return;
    }

    if (email.toLowerCase() === secondaryEmail.toLowerCase()) {
      setError("Secondary email must be different from your primary IITK email.");
      setIsLoading(false);
      return;
    }

    if (!chessUsername.trim()) {
      setError("Please enter your Chess.com username.");
      setIsLoading(false);
      return;
    }

    try {
      const recaptchaToken = await getRecaptchaToken('signup');
      const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          secondary_email: secondaryEmail.trim(),
          chess_username: chessUsername.trim(),
          recaptcha_token: recaptchaToken
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send OTP');
      } else {
        setSuccess('Verification code sent to your IITK email!');
        setStep(2); // Move to the OTP screen
      }
    } catch (err) {
      console.error("OTP Error:", err);
      setError(err.message || 'Cannot connect to the server. Is your Python backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  // --- STEP 2: Verify OTP & Register (Student) ---
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          secondary_email: secondaryEmail.trim(),
          primary_otp: primaryOtp.trim(),
          secondary_otp: secondaryOtp.trim(),
          password: password,
          chess_username: chessUsername.trim(),
          name: name.trim(),
          rollNo: rollNo.trim(),
          contact: contact.trim(),
          gender: gender
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Verification failed');
      } else {
        setSuccess('Account created successfully! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      console.error("Registration Error:", err);
      setError('Cannot connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlumniRequest = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!gender) {
      setError("Please select your gender.");
      setIsLoading(false);
      return;
    }

    const isIITK = (m) => m.toLowerCase().endsWith('@iitk.ac.in');
    const isValidIITK = (m) => /\d{2}@iitk\.ac\.in$/i.test(m.trim());

    if (isIITK(email) && !isValidIITK(email)) {
      setError("IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in).");
      setIsLoading(false);
      return;
    }

    try {
      const recaptchaToken = await getRecaptchaToken('alumni_request');
      const response = await fetch(`${API_BASE_URL}/api/alumni-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          roll_no: rollNo.trim(),
          graduation_year: alumniGradYear.trim(),
          chess_username: chessUsername.trim(),
          contact: contact.trim(),
          notes: alumniNotes.trim(),
          gender: gender,
          recaptcha_token: recaptchaToken
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to submit alumni request');
      } else {
        setAlumniSubmitted(true);
        setSuccess('Your details have been recorded and administrators have been notified!');
      }
    } catch (err) {
      console.error("Alumni Request Error:", err);
      setError(err.message || 'Cannot connect to the server. Please try again.');
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

      <div className="max-w-md w-full space-y-6 relative z-10 bg-surface-container-low p-8 sm:p-10 rounded-3xl border border-outline-variant/10 shadow-2xl">
        <div>
          <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-surface-container-high border border-outline-variant/20 shadow-inner mb-5">
            <span className="material-symbols-outlined text-3xl text-primary font-light">
              {mode === 'alumni' ? 'school' : step === 1 ? 'person_add' : 'stacked_email'}
            </span>
          </div>
          <h2 className="text-center text-3xl font-serif font-bold tracking-tight text-on-surface">
            {mode === 'alumni' ? (
              <>
                Alumnus <span className="text-primary">Access</span>
              </>
            ) : step === 1 ? (
              <>
                Sign <span className="text-primary">Up</span>
              </>
            ) : (
              <>
                Dual Verify <span className="text-primary">Email</span>
              </>
            )}
          </h2>
          <p className="text-center text-xs text-on-surface-variant/80 mt-2">
            {mode === 'alumni' 
              ? 'No @iitk.ac.in mail? Request manual verification from coordinators.' 
              : 'Join the premier chess community of IIT Kanpur.'}
          </p>
        </div>

        {/* Student vs Alumni Mode Selector Toggle */}
        {step === 1 && !alumniSubmitted && (
          <div className="flex bg-surface-container-lowest rounded-2xl p-1 border border-outline-variant/15">
            <button
              type="button"
              onClick={() => { setMode('student'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                mode === 'student' 
                  ? 'bg-primary text-[#3c2f00] shadow-md' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Active Member
            </button>
            <button
              type="button"
              onClick={() => { setMode('alumni'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                mode === 'alumni' 
                  ? 'bg-primary text-[#3c2f00] shadow-md' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Alumnus
            </button>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm text-center font-semibold bg-red-500/10 p-3 rounded-xl border border-red-500/20">
            {error}
          </div>
        )}
        {success && !alumniSubmitted && (
          <div className="text-green-500 text-sm text-center font-semibold bg-green-500/10 p-3 rounded-xl border border-green-500/20">
            {success}
          </div>
        )}

        {/* ========================================================= */}
        {/* --- ALUMNI REQUEST FORM --- */}
        {/* ========================================================= */}
        {mode === 'alumni' && (
          alumniSubmitted ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center mx-auto text-primary shadow-[0_0_25px_rgba(212,175,55,0.2)]">
                <span className="material-symbols-outlined text-3xl">hourglass_top</span>
              </div>
              <h3 className="text-xl font-serif text-on-surface font-bold">Admins Have Been Notified</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Please wait while admins verify your details. Your request has been recorded.
              </p>
              <p className="text-xs text-primary font-mono bg-primary/5 border border-primary/20 p-3 rounded-xl">
                Please wait, admins have been notified of your request.
              </p>
              <div className="pt-2">
                <Link
                  to="/"
                  className="inline-block px-6 py-2.5 rounded-xl bg-primary text-[#3c2f00] font-bold text-xs uppercase tracking-widest hover:bg-[#d4af37] transition-all"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleAlumniRequest}>
              <div className="space-y-3 rounded-md shadow-sm">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors"
                    placeholder="Your Name"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Personal Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors"
                    placeholder="alumnus@gmail.com"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="alumni-gender">Gender</label>
                  <select
                    id="alumni-gender"
                    required
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors cursor-pointer"
                  >
                    <option value="" disabled className="bg-[#121212] text-on-surface-variant/40">Select Gender</option>
                    <option value="Male" className="bg-[#121212] text-on-surface">Male</option>
                    <option value="Female" className="bg-[#121212] text-on-surface">Female</option>
                    <option value="Prefer not to say" className="bg-[#121212] text-on-surface">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Roll No / Batch</label>
                  <input
                    type="text"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors"
                    placeholder="180123"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Chess.com ID</label>
                    <input
                      type="text"
                      value={chessUsername}
                      onChange={(e) => setChessUsername(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors"
                      placeholder="chess_handle"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Contact No</label>
                    <input
                      type="tel"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-colors"
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1 ml-1">Note to Admins (Optional)</label>
                  <textarea
                    rows="2"
                    value={alumniNotes}
                    onChange={(e) => setAlumniNotes(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-xs transition-colors resize-none"
                    placeholder="e.g. B.Tech EE, former Chess Club member"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent text-xs font-label uppercase tracking-widest font-bold rounded-xl text-on-primary bg-primary hover:bg-[#d4af37] hover:shadow-[0_0_20px_rgba(242,202,80,0.3)] disabled:opacity-50 transition-all duration-300 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">notifications_active</span>
                  <span>{isLoading ? 'Transmitting...' : 'Notify Admins'}</span>
                </button>
                <p className="text-center text-xs text-on-surface-variant mt-4">
                  Already have an account?{' '}
                  <Link to="/login" className="font-bold text-primary hover:underline transition-all">
                    Sign In
                  </Link>
                </p>
              </div>
            </form>
          )
        )}

        {/* ========================================================= */}
        {/* --- STUDENT SIGNUP FORM STEP 1 --- */}
        {/* ========================================================= */}
        {mode === 'student' && step === 1 && (
          <form className="mt-4 space-y-4" onSubmit={handleSendDualOtp}>
            <div className="space-y-3.5 rounded-md shadow-sm">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="full-name">Full Name</label>
                <input
                  id="full-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors"
                  placeholder="Your Name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="roll-number">Roll Number</label>
                  <input
                    id="roll-number"
                    type="text"
                    required
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors"
                    placeholder="220123"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="contact-number">Contact No</label>
                  <input
                    id="contact-number"
                    type="tel"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors"
                    placeholder="9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="gender">Gender</label>
                <select
                  id="gender"
                  required
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors cursor-pointer"
                >
                  <option value="" disabled className="bg-[#121212] text-on-surface-variant/40">Select Gender</option>
                  <option value="Male" className="bg-[#121212] text-on-surface">Male</option>
                  <option value="Female" className="bg-[#121212] text-on-surface">Female</option>
                  <option value="Prefer not to say" className="bg-[#121212] text-on-surface">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="email-address">IITK Email Address</label>
                <input
                  id="email-address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:z-10 sm:text-sm transition-colors"
                  placeholder="student@iitk.ac.in"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="secondary-email-address">Secondary Recovery Email</label>
                <input
                  id="secondary-email-address"
                  type="email"
                  required
                  value={secondaryEmail}
                  onChange={(e) => setSecondaryEmail(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors"
                  placeholder="personal_mail@gmail.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="chess-username">Chess.com ID</label>
                <input
                  id="chess-username"
                  type="text"
                  required
                  value={chessUsername}
                  onChange={(e) => setChessUsername(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:z-10 sm:text-sm transition-colors"
                  placeholder="grandmaster_123"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-1.5 ml-1" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-2.5 pr-12 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary focus:z-10 sm:text-sm transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary transition-colors focus:outline-none z-20"
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
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-xs font-label uppercase tracking-widest font-bold rounded-xl text-on-primary bg-primary hover:bg-[#d4af37] hover:shadow-[0_0_20px_rgba(242,202,80,0.3)] disabled:opacity-50 transition-all duration-300 cursor-pointer"
              >
                {isLoading ? 'Sending Codes...' : 'Create Account'}
              </button>
              <p className="text-center text-sm text-on-surface-variant mt-4">
                Already have an account?{' '}
                <Link to="/login" className="font-bold text-primary hover:underline transition-all">
                  Sign In
                </Link>
              </p>
            </div>
          </form>
        )}

        {/* ========================================================= */}
        {/* --- STUDENT FORM STEP 2: Dual OTP Verification --- */}
        {/* ========================================================= */}
        {mode === 'student' && step === 2 && (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyAndRegister}>
            <div className="space-y-5 rounded-md shadow-sm">
              <p className="text-center text-xs text-on-surface-variant mb-4 leading-relaxed">
                We sent two different 6-digit verification codes to both your primary IITK email and recovery email.
              </p>
              {/* Primary Email OTP field */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2 ml-1">
                  Primary Code ({email})
                </label>
                <input
                  type="text"
                  maxLength="6"
                  required
                  value={primaryOtp}
                  onChange={(e) => setPrimaryOtp(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-center tracking-[0.4em] font-mono font-bold transition-colors"
                  placeholder="000000"
                />
              </div>

              {/* Secondary Email OTP field */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2 ml-1">
                  Secondary Code ({secondaryEmail})
                </label>
                <input
                  type="text"
                  maxLength="6"
                  required
                  value={secondaryOtp}
                  onChange={(e) => setSecondaryOtp(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-2.5 border border-outline-variant/20 bg-surface-container-lowest placeholder-on-surface-variant/30 text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-center tracking-[0.4em] font-mono font-bold transition-colors"
                  placeholder="000000"
                />
              </div>
            </div>

            <div className="pt-2 space-y-4">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-xs font-label uppercase tracking-widest font-bold rounded-xl text-on-primary bg-primary hover:bg-[#d4af37] hover:shadow-[0_0_20px_rgba(242,202,80,0.3)] disabled:opacity-50 transition-all duration-300 cursor-pointer"
              >
                {isLoading ? 'Verifying...' : 'Verify & Join'}
              </button>
              
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs font-bold text-on-surface-variant hover:text-primary transition-all cursor-pointer font-label uppercase tracking-wider"
              >
                ← Back to Edit Details
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default Signup;
