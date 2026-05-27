import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, ShoppingBag, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';


// ─── Password Strength ──────────────────────────────────────────────────────
function getPasswordStrength(password: string): { level: number; label: string; color: string } {
    if (password.length === 0) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-400' };
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-orange-400' };
    if (score <= 3) return { level: 3, label: 'Good', color: 'bg-yellow-400' };
    return { level: 4, label: 'Strong', color: 'bg-emerald-500' };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AuthModal() {
    const { authModal, openAuthModal, closeAuthModal, signInWithEmail, registerWithEmail } = useAuth();
    const { open, mode } = authModal;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [visible, setVisible] = useState(false);

    const overlayRef = useRef<HTMLDivElement>(null);

    const strength = getPasswordStrength(password);

    // Animate in/out
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
            setTimeout(() => setVisible(true), 10);
        } else {
            setVisible(false);
            const t = setTimeout(() => {
                document.body.style.overflow = '';
            }, 300);
            return () => clearTimeout(t);
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    const resetForm = () => {
        setEmail(''); setPassword(''); setConfirmPassword('');
        setName(''); setPhone(''); setError('');
        setShowPassword(false); setShowConfirmPassword(false);
    };

    const switchMode = (m: 'login' | 'register') => {
        resetForm();
        openAuthModal(m);
    };

    const handleClose = () => {
        closeAuthModal();
        setTimeout(resetForm, 300);
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) handleClose();
    };

    const friendlyError = (code: string) => {
        const map: Record<string, string> = {
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Please try again later.',
            'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
            'auth/invalid-credential': 'Invalid email or password.',
        };
        return map[code] || 'Something went wrong. Please try again.';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (mode === 'register') {
            if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
            if (!phone.trim()) { setError('Phone number is required.'); return; }
        }
        setLoading(true);
        try {
            if (mode === 'login') {
                await signInWithEmail(email, password);
            } else {
                await registerWithEmail(name, email, phone, password);
            }
        } catch (err: any) {
            setError(friendlyError(err.code));
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-[200] flex items-end md:items-center justify-center"
            style={{
                background: `rgba(15, 23, 42, ${visible ? '0.6' : '0'})`,
                backdropFilter: visible ? 'blur(4px)' : 'none',
                transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
            }}
        >
            {/* Modal Panel */}
            <div
                className="w-full md:w-[460px] bg-white rounded-t-[32px] md:rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                style={{
                    transform: visible ? 'translateY(0)' : 'translateY(100%)',
                    opacity: visible ? 1 : 0,
                    transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease',
                }}
            >
                {/* Drag handle (mobile) */}
                <div className="md:hidden flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-slate-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg shadow-emerald-100">
                            <ShoppingBag className="w-4 h-4" />
                        </div>
                        <span className="font-black text-slate-900 text-base">GANEWA</span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-900"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex mx-6 mt-4 bg-slate-100 rounded-2xl p-1">
                    <button
                        onClick={() => switchMode('login')}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                    >
                        Sign In
                    </button>
                    <button
                        onClick={() => switchMode('register')}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                    >
                        Create Account
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="overflow-y-auto flex-1 px-6 pt-6 pb-8">
                    {/* Headline */}
                    <div className="mb-6">
                        <h2 className="text-2xl font-black text-slate-950">
                            {mode === 'login' ? 'Welcome back!' : 'Join Ganewa Mall'}
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            {mode === 'login'
                                ? 'Sign in to track orders & save your addresses.'
                                : 'Create an account to shop smarter & faster.'}
                        </p>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-600 rounded-2xl px-4 py-3 mb-4">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="text-xs font-semibold leading-relaxed">{error}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-3">
                        {mode === 'register' && (
                            <>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Aminu Musa"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                                    <input
                                        type="tel"
                                        required
                                        placeholder="e.g. 08012345678"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="w-full bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address</label>
                            <input
                                type="email"
                                required
                                placeholder="your@email.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-300 pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {/* Password Strength Meter */}
                            {mode === 'register' && password.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4].map(i => (
                                            <div
                                                key={i}
                                                className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : 'bg-slate-100'}`}
                                            />
                                        ))}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${strength.level <= 1 ? 'text-red-400' : strength.level <= 2 ? 'text-orange-400' : strength.level <= 3 ? 'text-yellow-500' : 'text-emerald-600'}`}>
                                        {strength.label} password
                                    </span>
                                </div>
                            )}
                        </div>

                        {mode === 'register' && (
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        required
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className={`w-full bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 transition-all placeholder:text-slate-300 pr-12 ${confirmPassword && confirmPassword !== password ? 'ring-2 ring-red-400/30 bg-red-50' : 'focus:ring-emerald-500/30'}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(p => !p)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {confirmPassword && confirmPassword !== password && (
                                    <p className="text-[10px] text-red-500 font-bold mt-1 ml-1">Passwords don't match</p>
                                )}
                            </div>
                        )}

                        {mode === 'login' && (
                            <div className="text-right">
                                <button type="button" className="text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors">
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-xl shadow-slate-100"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer Switch Notice */}
                    <p className="text-center text-[11px] text-slate-400 font-medium mt-6">
                        {mode === 'login' ? (
                            <>Don't have an account?{' '}
                                <button onClick={() => switchMode('register')} className="font-black text-emerald-600 hover:underline">
                                    Create one
                                </button>
                            </>
                        ) : (
                            <>Already have an account?{' '}
                                <button onClick={() => switchMode('login')} className="font-black text-emerald-600 hover:underline">
                                    Sign in
                                </button>
                            </>
                        )}
                    </p>

                    <p className="text-center text-[10px] text-slate-300 font-medium mt-4 leading-relaxed">
                        By continuing, you agree to Ganewa Mall's{' '}
                        <span className="text-slate-400">Terms of Service</span> and{' '}
                        <span className="text-slate-400">Privacy Policy</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
