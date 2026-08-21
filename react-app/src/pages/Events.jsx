import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { globalCache } from '../utils/cache';
import Footer from '../components/Footer';
import { API_BASE_URL } from '../config';

const Events = () => {
  // 1. Pull auth context and token for admin verification and API calls
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedId, setExpandedId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const isReload = window.performance && 
      (window.performance.navigation?.type === 1 || 
       (performance.getEntriesByType("navigation")[0] && performance.getEntriesByType("navigation")[0].type === 'reload'));
    if (isReload) {
      return localStorage.getItem('selectedEventTab') || 'upcoming';
    }
    return 'upcoming';
  });

  const [selectedYear, setSelectedYear] = useState(() => {
    const isReload = window.performance && 
      (window.performance.navigation?.type === 1 || 
       (performance.getEntriesByType("navigation")[0] && performance.getEntriesByType("navigation")[0].type === 'reload'));
    if (isReload) {
      return localStorage.getItem('selectedEventYear') || '26-27 Tenure';
    }
    return '26-27 Tenure';
  });

  const prevKeyRef = useRef(location.key);

  useEffect(() => {
    if (prevKeyRef.current !== location.key) {
      prevKeyRef.current = location.key;
      if (activeTab === 'past' && !location.state?.scrollToEventId) {
        setActiveTab('upcoming');
      }
      if (selectedYear !== '26-27 Tenure' && !location.state?.scrollToEventId) {
        setSelectedYear('26-27 Tenure');
      }
    }
  }, [location, activeTab, selectedYear]);

  useEffect(() => {
    localStorage.setItem('selectedEventTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('selectedEventYear', selectedYear);
  }, [selectedYear]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    event_type: 'Tournament',
    short_description: '',
    event_briefing: '',
    event_date: '',
    event_end_date: '',
    event_time: '',
    location: '',
    format: '',
    register_link: ''
  });

  // LoL Registration Custom States
  const [isRegisteredForLol, setIsRegisteredForLol] = useState(false);
  const [isLolModalOpen, setIsLolModalOpen] = useState(false);
  const [lolProfileData, setLolProfileData] = useState(null);
  const [lolRegError, setLolRegError] = useState('');
  const [lolRegSuccess, setLolRegSuccess] = useState(false);
  const [isSubmittingLol, setIsSubmittingLol] = useState(false);
  const [isFetchingLolProfile, setIsFetchingLolProfile] = useState(false);

  // Check LoL registration status
  useEffect(() => {
    if (isLoggedIn && token) {
      const checkLolStatus = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/register-lol/status`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setIsRegisteredForLol(data.is_registered);
          }
        } catch (e) {
          console.error("Error checking lol registration status:", e);
        }
      };
      checkLolStatus();
    } else {
      setIsRegisteredForLol(false);
    }
  }, [isLoggedIn, token]);

  // Handle auto-opening registration modal from landing page announcement popup
  useEffect(() => {
    if (location.state?.openRegisterLol && isLoggedIn && token) {
      handleRegisterLolClick();
      window.history.replaceState({}, document.title);
    }
  }, [location.state, isLoggedIn, token]);

  // Handle auto-scroll and highlight when redirected from Calendar or other pages
  useEffect(() => {
    if (location.state?.scrollToEventId && events.length > 0) {
      const eventId = location.state.scrollToEventId;
      
      // Check if the event date is in the past to automatically toggle the correct tab
      const targetEvent = events.find(e => e.id === eventId);
      const today = new Date();
      today.setHours(0,0,0,0);
      const isPast = targetEvent && new Date(targetEvent.endDate || targetEvent.date) < today;
      
      if (isPast && targetEvent) {
        const eventYear = getEventTenure(targetEvent.endDate || targetEvent.date);
        setSelectedYear(eventYear);
        setActiveTab('past');
      } else {
        setActiveTab('upcoming');
      }

      setExpandedId(eventId);
      setHighlightedId(eventId);
      
      // Let details expand first, then scroll
      setTimeout(() => {
        const element = document.getElementById(eventId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      // Flash glow ends after 2.5 seconds
      const highlightTimer = setTimeout(() => {
        setHighlightedId(null);
      }, 2500);
      
      window.history.replaceState({}, document.title);
      return () => clearTimeout(highlightTimer);
    }
  }, [location.state, events]);

  const handleRegisterLolClick = async () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setIsFetchingLolProfile(true);
    setLolRegError('');
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const email = payload.sub || localStorage.getItem('logged_in_user_email');
      
      const response = await fetch(`${API_BASE_URL}/api/user/profile/${email}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const profile = await response.json();
        setLolProfileData(profile);
        setIsLolModalOpen(true);
      } else {
        setLolRegError("Failed to fetch profile properties. Please try again.");
      }
    } catch (err) {
      console.error("Failed to load profile for LoL registration:", err);
      setLolRegError("Connection failed. Please check your backend.");
    } finally {
      setIsFetchingLolProfile(false);
    }
  };

  const handleConfirmLolRegistration = async () => {
    setIsSubmittingLol(true);
    setLolRegError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/register-lol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: lolProfileData.email,
          name: lolProfileData.name,
          roll_no: lolProfileData.rollno,
          chess_username: lolProfileData.chesscom,
          contact: lolProfileData.contact,
          secondary_email: lolProfileData.secondary_email
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        setLolRegSuccess(true);
        setIsRegisteredForLol(true);
      } else {
        setLolRegError(data.error || "Failed to register.");
      }
    } catch (err) {
      console.error("LoL registration submission failure:", err);
      setLolRegError("Server connection error.");
    } finally {
      setIsSubmittingLol(false);
    }
  };

  // 2. Admin Check Logic
  let isAdmin = false;
  if (isLoggedIn && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'admin' || payload.role === 'secretary') {
        isAdmin = true;
      }
    } catch (error) {
      console.error("Could not decode token for admin check:", error);
    }
  }

  // 5. Fetch Events from Backend on Mount
  const formatDbEvents = (dbEvents) => {
    return dbEvents.map(dbEvent => ({
       id: `db-${dbEvent.id}`, 
       title: dbEvent.title,
       date: dbEvent.event_date,
       endDate: dbEvent.event_end_date,
       tag: dbEvent.event_type,
       time: dbEvent.event_time,
       location: dbEvent.location,
       format: dbEvent.format,
       shortDesc: dbEvent.short_description,
       fullDesc: dbEvent.event_briefing,
       register_link: dbEvent.register_link,
       schedule: [] 
    }));
  };

  // 5. Fetch Events from Backend on Mount
  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`);
      
      if (response.ok) {
        const dbEvents = await response.json();
        
        // Save the raw array to globalCache
        globalCache.events = dbEvents;

        const formattedDbEvents = formatDbEvents(dbEvents);

        // Sort events by date ascending
        formattedDbEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        setEvents(formattedDbEvents);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (globalCache.events) {
      // Format the cached raw events first to ensure IDs are formatted correctly
      const formatted = formatDbEvents(globalCache.events);
      formatted.sort((a, b) => new Date(a.date) - new Date(b.date));
      setEvents(formatted);
      setIsLoading(false);
      fetchEvents();
    } else {
      fetchEvents();
    }
  }, []);

  // 6. UI Interaction Handlers
  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Triggered when the "Edit" button is clicked
  const openEditModal = (event) => {
    setEditingEventId(event.id);
    
    let formattedDate = event.date;
    try {
      formattedDate = new Date(event.date).toISOString().split('T')[0];
    } catch(e) {}

    let formattedEndDate = '';
    if (event.endDate) {
      try {
        formattedEndDate = new Date(event.endDate).toISOString().split('T')[0];
      } catch(e) {}
    }

    setFormData({
      title: event.title,
      event_type: event.tag,
      short_description: event.shortDesc,
      event_briefing: event.fullDesc,
      event_date: formattedDate,
      event_end_date: formattedEndDate,
      event_time: event.time,
      location: event.location,
      format: event.format,
      register_link: event.register_link || ''
    });
    
    setIsModalOpen(true);
  };

  // Triggered when the "Delete" button is clicked
  const handleDelete = async (eventId) => {
    if (!window.confirm("Are you sure you want to permanently delete this event?")) return;

    const isDbEvent = String(eventId).startsWith('db-');
    
    if (isDbEvent) {
      const realId = eventId.replace('db-', '');
      try {
        await fetch(`${API_BASE_URL}/api/events/${realId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error("Failed to delete from database:", error);
      }
    }

    setEvents(prev => prev.filter(e => e.id !== eventId));
    setExpandedId(null);
  };

  // 7. Admin Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    const isDbEvent = editingEventId && String(editingEventId).startsWith('db-');
    const realId = isDbEvent ? editingEventId.replace('db-', '') : null;
    
    const method = editingEventId ? 'PUT' : 'POST';
    const endpoint = realId ? `/api/events/${realId}` : '/api/events';

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(`Event ${editingEventId ? 'updated' : 'created'} successfully!`);
        setIsModalOpen(false);
        setEditingEventId(null); 
        
        // Reset Form
        setFormData({
          title: '',
          event_type: 'Tournament',
          short_description: '',
          event_briefing: '',
          event_date: '',
          event_end_date: '',
          event_time: '',
          location: '',
          format: '',
          register_link: ''
        });

        // Re-fetch events
        const updatedResponse = await fetch(`${API_BASE_URL}/api/events`);
        if (updatedResponse.ok) {
           const dbEvents = await updatedResponse.json();
           const formattedDbEvents = dbEvents.map(dbEvent => ({
             id: `db-${dbEvent.id}`,
             title: dbEvent.title,  
             date: dbEvent.event_date,
             endDate: dbEvent.event_end_date,
             tag: dbEvent.event_type,
             time: dbEvent.event_time,
             location: dbEvent.location,
             format: dbEvent.format,
             shortDesc: dbEvent.short_description,
             fullDesc: dbEvent.event_briefing,
             register_link: dbEvent.register_link,
             schedule: [] 
          }));
          formattedDbEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
          setEvents(formattedDbEvents);
          globalCache.events = formattedDbEvents;
        }
      }
    } catch (error) {
      console.error("Failed to save event:", error);
    }
  };

  const today = new Date();
  today.setHours(0,0,0,0);

  // Divide events based on current date
  const upcomingEvents = events.filter(e => {
    const compareDate = new Date(e.endDate || e.date);
    compareDate.setHours(0,0,0,0);
    return compareDate >= today;
  });

  // Calculate dynamic list of tenures available for past events (e.g. 26-27 Tenure)
  const getEventTenure = (dateStr) => {
    try {
      const d = new Date(dateStr);
      let dateObj = d;
      if (isNaN(d.getTime())) {
        return "26-27 Tenure";
      }
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth(); // 0-indexed: 0 = Jan, 4 = May, 5 = June
      let startYear;
      if (month >= 5) {
        startYear = year;
      } else {
        startYear = year - 1;
      }
      const y = startYear % 100;
      const yNext = (startYear + 1) % 100;
      return `${y.toString().padStart(2, '0')}-${yNext.toString().padStart(2, '0')} Tenure`;
    } catch {
      return "26-27 Tenure";
    }
  };

  const availableYears = Array.from(new Set(
    events
      .filter(e => {
        const compareDate = new Date(e.endDate || e.date);
        compareDate.setHours(0,0,0,0);
        return compareDate < today;
      })
      .map(e => getEventTenure(e.endDate || e.date))
  )).sort((a, b) => b.localeCompare(a));
  
  const yearsList = availableYears.length > 0 ? availableYears : ['26-27 Tenure'];

  useEffect(() => {
    if (!isLoading && yearsList.length > 0 && !yearsList.includes(selectedYear)) {
      setSelectedYear(yearsList[0]);
    }
  }, [isLoading, yearsList, selectedYear]);

  const pastEvents = events
    .filter(e => {
      const compareDate = new Date(e.endDate || e.date);
      compareDate.setHours(0,0,0,0);
      const isPast = compareDate < today;
      if (!isPast) return false;
      
      const eventTenure = getEventTenure(e.endDate || e.date);
      return eventTenure === selectedYear;
    })
    .sort((a, b) => new Date(b.endDate || b.date) - new Date(a.endDate || a.date));

  const renderEventCard = (event) => {
    const isLolEvent = event.title.toLowerCase().includes("league of legends");
    const eventStartDate = new Date(event.date);
    const eventEndDate = event.endDate ? new Date(event.endDate) : null;
    
    return (
      <div 
        key={event.id}
        id={event.id}
        className={`bg-surface-container-low border rounded-2xl overflow-hidden transition-all duration-700 ${
          highlightedId === event.id
            ? 'border-primary shadow-[0_0_35px_rgba(242,202,80,0.25)] scale-[1.01]'
            : 'border-outline-variant/15 hover:border-outline-variant/30'
        }`}
      >
        {/* Event Header (Always Visible) */}
        <div 
          className="p-6 md:p-8 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6"
          onClick={() => toggleExpand(event.id)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-on-surface-variant/70 mb-3 uppercase">
              <span className="text-primary">{event.tag}</span>
              <span>•</span>
              <span>
                {eventEndDate ? (
                  `${eventStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${eventEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                ) : (
                  eventStartDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                )}
              </span>
            </div>
            <h3 className="text-2xl font-serif text-on-surface mb-3">{event.title}</h3>
            <p className="text-on-surface-variant leading-relaxed max-w-3xl text-sm sm:text-base font-light">
              {event.shortDesc}
            </p>
          </div>
          
          <div className="flex items-center justify-between md:flex-col md:items-end gap-4 min-w-[140px]">
            <div className="text-left md:text-right">
              <div className="text-xs text-on-surface-variant/70 tracking-wider mb-1 uppercase font-mono">Time</div>
              <div className="font-medium text-on-surface">{event.time}</div>
            </div>
            <button 
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                expandedId === event.id ? 'bg-primary text-[#3c2f00]' : 'bg-surface-container border border-outline-variant/20 text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <svg 
                className={`w-5 h-5 transition-transform duration-300 ${expandedId === event.id ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded Details Section */}
        {expandedId === event.id && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-outline-variant/10 bg-surface-container/40 p-6 md:p-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2">
                <h4 className="text-xs font-bold tracking-widest text-primary mb-4 uppercase font-label">Event Briefing</h4>
                <p className="text-on-surface-variant leading-relaxed whitespace-pre-line text-sm sm:text-base font-light">
                  {event.fullDesc}
                </p>
              </div>
              
              <div className="space-y-6">
                {event.location && (
                  <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/15">
                    <h4 className="text-xs font-bold tracking-widest text-on-surface-variant/70 mb-2 uppercase flex items-center gap-2 font-mono">
                      Location
                    </h4>
                    <p className="text-on-surface text-sm">{event.location}</p>
                  </div>
                )}
                
                {event.format && (
                  <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/15">
                    <h4 className="text-xs font-bold tracking-widest text-on-surface-variant/70 mb-2 uppercase flex items-center gap-2 font-mono">
                      Match Format
                    </h4>
                    <p className="text-on-surface text-sm">{event.format}</p>
                  </div>
                )}

                <div className="pt-2">
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const compareDate = eventEndDate ? new Date(eventEndDate) : new Date(eventStartDate);
                    compareDate.setHours(0, 0, 0, 0);
                    const isPastEvent = compareDate < today;

                    if (isPastEvent) {
                      return (
                        <div className="space-y-3">
                          <button
                            disabled
                            className="block w-full text-center bg-surface-container-high text-on-surface-variant/40 py-3 rounded-xl font-bold cursor-not-allowed border border-outline-variant/10 text-xs font-label uppercase tracking-widest"
                          >
                            REGISTRATION CLOSED
                          </button>
                          <Link
                            to={`/events/results/${event.id}`}
                            className="block w-full text-center bg-primary text-[#3c2f00] py-3 rounded-xl font-bold hover:bg-[#d4af37] transition-colors text-xs font-label uppercase tracking-widest shadow-md shadow-primary/10"
                          >
                            VIEW STANDINGS
                          </Link>
                        </div>
                      );
                    }

                    if (isLolEvent) {
                      return isRegisteredForLol ? (
                        <button
                          disabled
                          className="block w-full text-center bg-surface-container-high text-on-surface-variant/60 py-3 rounded-xl font-bold cursor-not-allowed border border-outline-variant/20 text-xs font-label uppercase tracking-widest"
                        >
                          REGISTERED ✓
                        </button>
                      ) : (
                        <button 
                          onClick={handleRegisterLolClick}
                          disabled={isFetchingLolProfile}
                          className="block w-full text-center bg-primary text-[#3c2f00] py-3 rounded-xl font-bold hover:bg-[#d4af37] transition-colors text-xs font-label uppercase tracking-widest shadow-md shadow-primary/10"
                        >
                          {isFetchingLolProfile ? "LOADING PROFILE..." : "REGISTER"}
                        </button>
                      );
                    }

                    let registrationUrl = null;
                    try {
                      const parsedUrl = new URL(event.register_link);
                      if (['http:', 'https:'].includes(parsedUrl.protocol)) {
                        registrationUrl = parsedUrl.href;
                      }
                    } catch {
                      // Invalid or legacy unsafe links are not rendered as clickable actions.
                    }

                    if (registrationUrl) {
                      return (
                        <a 
                          href={registrationUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block w-full text-center bg-primary text-[#3c2f00] py-3 rounded-xl font-bold hover:bg-[#d4af37] transition-colors text-xs font-label uppercase tracking-widest shadow-md shadow-primary/10"
                        >
                          REGISTER
                        </a>
                      );
                    }

                    return null;
                  })()}
                </div>
              </div>
            </div>
            
            {/* Admin Edit/Delete Controls */}
            {isAdmin && (
              <div className="mt-8 pt-6 border-t border-outline-variant/10 flex flex-wrap items-center gap-4">
                <button 
                  onClick={() => openEditModal(event)}
                  className="bg-surface-container-high text-primary border border-primary/30 px-5 py-2 rounded-lg font-bold text-xs uppercase font-label tracking-wider hover:bg-surface-container-highest transition-colors"
                >
                  Edit Event
                </button>
                <button 
                  onClick={() => handleDelete(event.id)}
                  className="bg-red-900/30 text-red-400 border border-red-900/50 px-5 py-2 rounded-lg font-bold text-xs uppercase font-label tracking-wider hover:bg-red-900/60 hover:text-red-200 transition-colors"
                >
                  Delete Event
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen text-on-surface pt-4 sm:pt-6 font-sans relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 relative">
        
        {/* Header Section */}
        <div className="flex justify-between items-end border-b border-outline-variant/10 pb-8 mb-10">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-serif leading-tight text-on-surface sm:text-5xl">
              Club Events
            </h1>
            <p className="mt-3 text-sm font-light leading-relaxed text-on-surface-variant/80 sm:text-base">
              The curated schedule of major club events, workshops, and tournaments.
            </p>
          </div>

          {/* Admin Create Event Button */}
          {isAdmin && (
            <button 
              onClick={() => {
                setEditingEventId(null);
                setFormData({
                  title: '',
                  event_type: 'Tournament',
                  short_description: '',
                  event_briefing: '',
                  event_date: '',
                  event_end_date: '',
                  event_time: '',
                  location: '',
                  format: '',
                  register_link: ''
                });
                setIsModalOpen(true);
              }}
              className="bg-primary text-[#3c2f00] px-6 py-2.5 rounded-xl font-bold text-xs font-label uppercase tracking-widest hover:bg-[#d4af37] transition-colors shadow-lg shrink-0 cursor-pointer"
            >
              + Create Event
            </button>
          )}
        </div>

        {/* Tab Selection Sub-Navbar with divider */}
        <div className="flex border-b border-outline-variant/10 mb-10 pb-4 items-center gap-6">
          <button 
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`text-xl font-serif transition-colors outline-none cursor-pointer ${
              activeTab === 'upcoming' ? 'text-primary font-bold' : 'text-on-surface-variant/70 hover:text-on-surface'
            }`}
          >
            Upcoming Events
          </button>
          
          {/* Vertical Title Divider */}
          <div className="h-5 w-[1px] bg-outline-variant/20" />
          
          <button 
            type="button"
            onClick={() => setActiveTab('past')}
            className={`text-xl font-serif transition-colors outline-none cursor-pointer ${
              activeTab === 'past' ? 'text-primary font-bold' : 'text-on-surface-variant/70 hover:text-on-surface'
            }`}
          >
            Past Events
          </button>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div>
            {activeTab === 'upcoming' ? (
              <div>
                {upcomingEvents.length === 0 ? (
                  <p className="text-gray-500 italic py-8">No upcoming events scheduled currently.</p>
                ) : (
                  <div className="space-y-6">
                    {upcomingEvents.map(event => renderEventCard(event))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-12 mt-8">
                {/* Left Column: Year Navigation Buttons matching PreviousTeams */}
                <div className="w-full md:w-1/4 flex flex-col gap-4">
                  {yearsList.map((year) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => setSelectedYear(year)}
                      className={`w-full px-6 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all duration-300 relative overflow-hidden flex items-center justify-between group cursor-pointer
                        ${selectedYear === year 
                          ? 'bg-primary text-on-primary shadow-lg shadow-primary/30 border-none' 
                          : 'bg-surface-container-low border border-outline-variant/30 text-on-surface hover:border-primary hover:text-primary'
                        }`}
                    >
                      <span className="relative z-10 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[18px] opacity-80">
                          calendar_month
                        </span>
                        {year}
                      </span>
                      {selectedYear === year && (
                        <span className="material-symbols-outlined relative z-10 text-[18px]">
                          chevron_right
                        </span>
                      )}
                      {/* Subtle hover effect for inactive buttons */}
                      {selectedYear !== year && (
                        <div className="absolute inset-0 bg-primary/5 translate-x-[-100%] group-hover:translate-x-[0%] transition-transform duration-500 ease-out"></div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Right Column: Events for Selected Year */}
                <div className="w-full md:w-3/4">
                  <div className="mb-6 border-b border-outline-variant/20 pb-4">
                    <h3 className="text-3xl sm:text-4xl font-serif font-bold text-on-surface">
                      {selectedYear} Events
                    </h3>
                  </div>

                  {pastEvents.length === 0 ? (
                    <p className="text-gray-500 italic py-8">No past events recorded for {selectedYear}.</p>
                  ) : (
                    <div className="space-y-6">
                      {pastEvents.map(event => renderEventCard(event))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />

      {/* LoL Registration Modal */}
      {isLolModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4">
          <div className="bg-[#1a1a1a] p-8 rounded-xl max-w-lg w-full border border-gray-700 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-2xl text-yellow-400 mb-2 font-serif font-bold">Event Registration</h2>
            <p className="text-gray-400 text-sm mb-6">League of Legends 6.0</p>
            
            {lolRegSuccess ? (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-6xl text-green-500 mb-4">check_circle</span>
                <h3 className="text-xl font-bold text-gray-100 mb-2">Registration Confirmed!</h3>
                <p className="text-gray-400 text-sm mb-6">You have been successfully registered for League of Legends 6.0.</p>
                <button 
                  onClick={() => {
                    setIsLolModalOpen(false);
                    setLolRegSuccess(false);
                  }}
                  className="px-6 py-2 bg-yellow-400 text-black font-bold rounded-md hover:bg-yellow-500 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 text-gray-200">
                <p className="text-xs text-yellow-400/80 mb-2 font-semibold">
                  ⚠️ Please verify that your profile details below are correct. These details cannot be modified during registration.
                </p>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                  <input readOnly value={lolProfileData?.name || ''} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Roll Number</label>
                    <input readOnly value={lolProfileData?.rollno || ''} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Chess.com Username</label>
                    <input readOnly value={lolProfileData?.chesscom || ''} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Primary Email (IITK)</label>
                  <input readOnly value={lolProfileData?.email || ''} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Secondary Email (Gmail)</label>
                  <input readOnly value={lolProfileData?.secondary_email || 'Not Provided'} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
                  <input readOnly value={lolProfileData?.contact || ''} className="w-full p-2.5 bg-[#111111] rounded-md border border-gray-800 text-gray-400 cursor-not-allowed focus:outline-none" />
                </div>

                {lolRegError && (
                  <div className="text-red-400 text-xs mt-2 bg-red-950/30 border border-red-900/50 p-2.5 rounded-md">
                    {lolRegError}
                  </div>
                )}

                <div className="flex justify-end gap-4 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setIsLolModalOpen(false)} 
                    disabled={isSubmittingLol}
                    className="px-5 py-2 bg-gray-800 rounded-md hover:bg-gray-700 transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmLolRegistration}
                    disabled={isSubmittingLol}
                    className="px-5 py-2 bg-yellow-400 text-black font-bold rounded-md hover:bg-yellow-500 transition-colors text-sm flex items-center gap-2"
                  >
                    {isSubmittingLol ? "Registering..." : "Confirm & Register"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4">
          <div className="bg-[#1a1a1a] p-8 rounded-xl max-w-2xl w-full border border-gray-700 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-2xl text-yellow-400 mb-6 font-serif font-bold">
              {editingEventId ? 'Edit Event' : 'Create New Event'}
            </h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 text-gray-200">
              <input name="title" value={formData.title} placeholder="Event Title" required onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none transition-colors" />
              
              <div className="flex flex-col md:flex-row gap-5">
                <select name="event_type" value={formData.event_type} onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none flex-1">
                  <option value="Tournament">Tournament</option>
                  <option value="Workshop">Workshop</option>
                  <option value="Social">Social</option>
                </select>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Start Date *</label>
                  <input type="date" name="event_date" value={formData.event_date} required onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none w-full [color-scheme:dark]" />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">End Date (Optional for Multi-day)</label>
                  <input type="date" name="event_end_date" value={formData.event_end_date} onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none w-full [color-scheme:dark]" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Time (e.g., 9:00 PM Onwards)</label>
                  <input name="event_time" value={formData.event_time} placeholder="Time" required onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none w-full" />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-5">
                <input name="location" value={formData.location} placeholder="Location (e.g., chess.com or LH7)" onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none flex-1" />
                <input name="format" value={formData.format} placeholder="Format (e.g., 3+0 Knockouts)" onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none flex-1" />
              </div>

              <input name="register_link" value={formData.register_link} placeholder="Registration URL (Optional)" onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none w-full" />

              <textarea name="short_description" value={formData.short_description} placeholder="Short Description (for the card header)" rows="2" onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none"></textarea>
              <textarea name="event_briefing" value={formData.event_briefing} placeholder="Full Event Briefing" rows="5" onChange={handleChange} className="p-3 bg-[#111111] rounded-md border border-gray-800 focus:border-yellow-400 focus:outline-none"></textarea>

              <div className="flex justify-end gap-4 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 bg-gray-800 rounded-md hover:bg-gray-700 transition-colors font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-yellow-400 text-black font-bold rounded-md hover:bg-yellow-500 transition-colors">Save Event</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
