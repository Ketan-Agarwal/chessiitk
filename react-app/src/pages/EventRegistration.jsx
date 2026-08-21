import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { OFFICIAL_EVENTS } from '../constants/events';
import { API_BASE_URL } from '../config';

const EventRegistration = () => {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', rollNo: '', phone: '', email: '', remarks: '' });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let found = OFFICIAL_EVENTS.find(e => String(e.id) === String(id));
    if (found) {
      setEvent(found);
      setLoading(false);
      return;
    }
    
    const fetchEvent = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/events`);
        if (response.ok) {
          const dbEvents = await response.json();
          const cleanId = String(id).replace('db-', '');
          const dbFound = dbEvents.find(e => String(e.id) === cleanId);
          if (dbFound) {
            setEvent({
              id: `db-${dbFound.id}`,
              title: dbFound.title,
              date: dbFound.event_date,
              endDate: dbFound.event_end_date,
              tag: dbFound.event_type,
              time: dbFound.event_time,
              location: dbFound.location,
              format: dbFound.format,
              shortDesc: dbFound.short_description,
              fullDesc: dbFound.event_briefing
            });
          }
        }
      } catch (err) {
        console.error("Error fetching event for registration:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  useEffect(() => {
    const email = localStorage.getItem('logged_in_user_email');
    const token = localStorage.getItem('chess-club-jwt');
    if (!email || !token) return;

    fetch(`${API_BASE_URL}/api/user/profile/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Profile unavailable')))
      .then((profile) => setFormData((current) => ({
        ...current,
        name: profile.name || '',
        rollNo: profile.rollNo || '',
        phone: profile.contact || '',
        email: profile.email || email
      })))
      .catch(() => setSubmitError('Unable to load your verified profile. Please refresh or update your profile.'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const token = localStorage.getItem('chess-club-jwt');
      const eventId = String(event.id).replace('db-', '');
      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ remarks: formData.remarks })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Registration failed.');

      const savedParticipations = JSON.parse(localStorage.getItem('chess-club-participations') || '[]');
      if (!savedParticipations.find(p => p.eventId === event.id)) {
        savedParticipations.push({
          id: `rsvp_${Date.now()}`,
          eventId: event.id,
          title: event.title,
          date: event.date,
          time: event.time,
          tag: event.tag,
          registeredAt: new Date().toISOString()
        });
        localStorage.setItem('chess-club-participations', JSON.stringify(savedParticipations));
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f2ca50', '#d4af37', '#ffffff', '#1c1b1b'] 
      });
    } catch (error) {
      setSubmitError(error.message);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="px-12 py-20 max-w-3xl mx-auto text-center min-h-screen">
        <h2 className="text-3xl font-serif text-on-surface mb-4">Event Not Found</h2>
        <Link to="/events" className="text-primary hover:underline font-label uppercase tracking-widest text-xs">Return to Directory</Link>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-12 py-12 max-w-4xl mx-auto min-h-screen flex flex-col">
      <Link to="/events" className="group inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-[10px] font-label uppercase tracking-widest mb-10 w-fit">
        <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
        Back to Events
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl md:text-5xl font-serif text-on-surface leading-tight mb-4">{event.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-label uppercase tracking-widest font-bold text-on-surface-variant">
          <span className="text-on-surface">{event.date}</span>
          <span>•</span>
          <span>{event.time}</span>
          <span>•</span>
          <span className="truncate">{event.location}</span>
          {event.format && (
            <>
              <span>•</span>
              <span className="text-primary truncate">{event.format}</span>
            </>
          )}
        </div>
      </div>

      <div className="bg-surface-container border border-[#4d4635]/20 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

        {isSubmitted ? (
          /* SUCCESS STATE */
          <div className="h-full flex flex-col items-center justify-center text-center py-10 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center mb-6 text-primary shadow-[0_0_30px_rgba(212,175,55,0.2)]">
              <span className="material-symbols-outlined text-4xl">check</span>
            </div>
            <h2 className="text-3xl font-serif text-on-surface mb-3">RSVP Confirmed</h2>
            <p className="text-sm text-on-surface-variant max-w-sm leading-relaxed mb-8">
              Your details have been registered into the official ledger. Please verify your inbox for further scheduling protocol.
            </p>
            <Link
              to="/events"
              className="px-8 py-3 bg-[#1c1b1b] border border-outline-variant/30 text-on-surface hover:border-primary/50 hover:text-primary transition-all rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              Return to Events
            </Link>
          </div>
        ) : (
          /* FORM STATE */
          <form onSubmit={handleSubmit} className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

            {submitError && (
              <div className="md:col-span-2 text-red-500 text-sm bg-red-500/10 p-3 rounded-lg">
                {submitError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5 focus-within:text-primary transition-colors">Full Name</label>
                <input
                  type="text"
                  required
                  readOnly
                  placeholder="e.g. Inesh Aggarwal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#131313] border border-[#4d4635]/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors focus:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5 focus-within:text-primary transition-colors">Institute Roll Number</label>
                <input
                  type="text"
                  required
                  readOnly
                  placeholder="e.g. 210123"
                  value={formData.rollNo}
                  onChange={(e) => setFormData({ ...formData, rollNo: e.target.value })}
                  className="w-full bg-[#131313] border border-[#4d4635]/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors focus:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5 focus-within:text-primary transition-colors">IITK Email ID</label>
                <input
                  type="email"
                  required
                  readOnly
                  placeholder="e.g. member@iitk.ac.in"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-[#131313] border border-[#4d4635]/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors focus:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5 focus-within:text-primary transition-colors">
                  Contact Number
                </label>
                <input
                  type="tel"
                  required
                  readOnly
                  placeholder="e.g. 9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-[#131313] border border-[#4d4635]/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors focus:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                />
              </div>
            </div>

            <div className="space-y-4 flex flex-col h-full">
              <div className="flex-1 flex flex-col">
                <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5 focus-within:text-primary transition-colors">Tactical Remarks / Queries</label>
                <textarea
                  placeholder="Any specific questions for the organizers or dietary constraints?"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full flex-1 bg-[#131313] border border-[#4d4635]/30 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors focus:shadow-[0_0_15px_rgba(212,175,55,0.1)] resize-none"
                ></textarea>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full bg-gradient-to-r from-[#f2ca50] to-[#d4af37] text-[#3c2f00] font-bold py-4 rounded-lg text-xs uppercase tracking-widest outline-none transition-all ${isSubmitting ? 'opacity-80 scale-[0.98]' : 'hover:scale-[1.02] shadow-[0_10px_20px_rgba(212,175,55,0.15)]'}`}
                >
                  {isSubmitting ? 'Transmitting Data...' : 'Confirm Registration'}
                </button>
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};

export default EventRegistration;
