import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext'; 
import { globalCache } from '../utils/cache';
import Footer from '../components/Footer';

import fresherImg from '../assets/fcl.png';
import tournamentImg from '../assets/fide.png';
import winnerImg from '../assets/anuj_shivratri.png';
import defaultBlogHero from '../assets/chessclubiitklogo.jpeg';

// Dynamic Read Time Calculator Utility
const calculateReadTime = (text) => {
  if (!text) return "1 Min Read";
  const wordsPerMinute = 200;
  const numberOfWords = text.trim().split(/\s+/).length;
  const minutes = Math.ceil(numberOfWords / wordsPerMinute);
  return `${minutes} Min Read`;
};

const formatBlogDate = (raw) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getBlogTag = (post) => {
  if (!post) return "Tournament News";
  if (post.tag) return post.tag;
  const standardTags = ["Tournament News", "Event Recap", "Puzzle Analytics"];
  if (post.subtitle && standardTags.includes(post.subtitle.trim())) {
    return post.subtitle.trim();
  }
  return "Tournament News";
};

const getBlogExcerpt = (post, maxLength = 180) => {
  if (!post) return "";
  if (post.excerpt) return post.excerpt;
  const standardTags = ["Tournament News", "Event Recap", "Puzzle Analytics"];
  if (post.subtitle && !standardTags.includes(post.subtitle.trim())) {
    return post.subtitle;
  }
  if (post.content) {
    const clean = post.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length > maxLength) {
      return clean.slice(0, maxLength) + "...";
    }
    return clean;
  }
  return "Read the full dispatch from the Chess Club.";
};

const getTime = (p) => {
  const raw = p.created_at || p.date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return isNaN(t) ? null : t;
};

const sortPostsChronologically = (list) => {
  return [...list].sort((a, b) => {
    const timeA = getTime(a);
    const timeB = getTime(b);

    // 1. Both posts have valid dates: Sort newest first
    if (timeA !== null && timeB !== null) {
      if (timeB !== timeA) return timeB - timeA;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    }

    // 2. Post 'a' has no date -> push 'a' to the very last
    if (timeA === null && timeB !== null) return 1;

    // 3. Post 'b' has no date -> push 'b' to the very last
    if (timeA !== null && timeB === null) return -1;

    // 4. Neither has a date -> tie-break deterministically by ID
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
};

const LEGACY_BACKUP_POSTS = [];

const Blogs = () => {
  // 1. Get user data from context safely using optional chaining
  const authContext = useAuth();
  const user = authContext?.user;
  const token = authContext?.token;

  // 2. Try to pull admin status from context OR fall back to a manual check if context is broken
  const localEmail = localStorage.getItem('logged_in_user_email');
  
  // To avoid crashes, we treat them as admin ONLY if context says so, 
  // or if they have a real email session going during local tests
  const isAdmin = user?.is_admin === 1 || user?.is_admin === true;

  const location = useLocation();
  const prevKeyRef = useRef(location.key);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(() => {
    const isReload = window.performance && 
      (window.performance.navigation?.type === 1 || 
       (performance.getEntriesByType("navigation")[0] && performance.getEntriesByType("navigation")[0].type === 'reload'));
    if (isReload) {
      return localStorage.getItem('selectedBlogYear') || '26-27 Tenure';
    }
    return '26-27 Tenure';
  });
  const [viewMode, setViewMode] = useState('grid');
  const [error, setError] = useState("");

  useEffect(() => {
    if (prevKeyRef.current !== location.key) {
      prevKeyRef.current = location.key;
      if (selectedYear !== '26-27 Tenure') {
        setSelectedYear('26-27 Tenure');
      }
    }
  }, [location, selectedYear]);

  useEffect(() => {
    localStorage.setItem('selectedBlogYear', selectedYear);
  }, [selectedYear]);

  // Create/Edit Mode Form Inputs 
  const [showEditor, setShowEditor] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newTag, setNewTag] = useState("Tournament News");
  const [newContent, setNewContent] = useState("");
  const [newCover, setNewCover] = useState("");
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorPosition, setNewAuthorPosition] = useState("");
  const [newDate, setNewDate] = useState("");
  
  // Custom Danger Confirmation Modal State
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const getPostYear = (post) => {
    if (!post) return '26-27 Tenure';
    if (post.title && post.title.includes("The Story of Chess Club IITK")) {
      return 'Club History';
    }
    const raw = post.created_at || post.date;
    if (!raw) return '26-27 Tenure';
    const d = new Date(raw);
    let dateObj = d;
    if (isNaN(d.getTime())) {
      const match = String(raw).match(/\b(20\d\d)\b/);
      if (match) {
        dateObj = new Date(parseInt(match[1], 10), 5, 1);
      } else {
        return '26-27 Tenure';
      }
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
  };

  const getImageUrl = (url) => {
    if (!url) return defaultBlogHero;
    if (typeof url !== 'string') return url;
    if (url.startsWith('/static/')) {
      return `${API_BASE_URL}${url}`;
    }
    return url;
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      setError("");
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setNewCover(data.image_url);
    } catch (err) {
      console.error(err);
      alert("Error uploading image to server.");
    }
  };

  const fetchAllPosts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/blogs`);
      let dbData = [];
      if (response.ok) dbData = await response.json();
      const rawPosts = (dbData && dbData.length > 0) ? dbData : LEGACY_BACKUP_POSTS;
      const sorted = sortPostsChronologically(rawPosts);
      setPosts(sorted);
      globalCache.blogs = sorted;
    } catch (err) {
      const fallbackSorted = sortPostsChronologically(LEGACY_BACKUP_POSTS);
      setPosts(fallbackSorted);
      globalCache.blogs = fallbackSorted;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (globalCache.blogs && globalCache.blogs.length > 0) {
      setPosts(globalCache.blogs);
      setLoading(false);
      fetchAllPosts();
    } else {
      fetchAllPosts();
    }
  }, []);

  const uniqueYears = Array.from(new Set(posts.map(p => getPostYear(p))))
    .filter(y => y !== 'Club History')
    .sort((a, b) => b.localeCompare(a));
  const hasHistory = posts.some(p => getPostYear(p) === 'Club History');
  const yearsList = hasHistory ? [...uniqueYears, 'Club History'] : (uniqueYears.length > 0 ? uniqueYears : ['26-27 Tenure']);

  useEffect(() => {
    if (!loading && yearsList.length > 0 && !yearsList.includes(selectedYear)) {
      setSelectedYear(yearsList[0]);
    }
  }, [loading, yearsList, selectedYear]);

  const filteredPosts = posts.filter(p => getPostYear(p) === selectedYear);

  const handleStartEdit = (post) => {
    setEditingPostId(post.id);
    setNewTitle(post.title || "");
    setNewSubtitle(post.subtitle || "");
    setNewTag(getBlogTag(post));
    setNewCover(post.cover_image || post.image || "");
    setNewAuthorName(post.author_name || post.author || "");
    setNewAuthorPosition(post.author_position || post.authorRole || "");
    if (post.created_at || post.date) {
      const postDate = new Date(post.created_at || post.date);
      if (!isNaN(postDate.getTime())) {
        const yyyy = postDate.getFullYear();
        const mm = String(postDate.getMonth() + 1).padStart(2, '0');
        const dd = String(postDate.getDate()).padStart(2, '0');
        setNewDate(`${yyyy}-${mm}-${dd}`);
      } else setNewDate("");
    } else setNewDate("");
    setNewContent(post.content || "");
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const effectiveEmail = user?.email || localEmail;
    if (!isAdmin || !effectiveEmail) {
      alert("Unauthorized operational state exception.");
      return;
    }
    if (!newTitle || !newContent) return;
    try {
      const url = editingPostId ? `${API_BASE_URL}/api/blogs/${editingPostId}` : `${API_BASE_URL}/api/blogs`;
      const method = editingPostId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          author_email: effectiveEmail,
          title: newTitle,
          subtitle: newSubtitle || newTag,
          content: newContent,
          cover_image: newCover,
          author_name: newAuthorName,
          author_position: newAuthorPosition,
          created_at: newDate ? new Date(newDate).toISOString() : null
        }),
      });
      if (!response.ok) throw new Error("Could not process request");
      globalCache.blogs = null;
      setNewTitle(""); setNewSubtitle(""); setNewContent(""); setNewCover(""); setNewAuthorName(""); setNewAuthorPosition(""); setNewDate("");
      setEditingPostId(null);
      setShowEditor(false);
      fetchAllPosts();
    } catch (err) {
      alert(`Error ${editingPostId ? 'updating' : 'publishing'} blog post.`);
    }
  };

  const confirmDelete = async () => {
    const effectiveEmail = user?.email || localEmail;
    if (!deleteTargetId || !effectiveEmail) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/blogs/${deleteTargetId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: effectiveEmail })
      });
      if (!response.ok) throw new Error("Unauthorized operational delete block");
      globalCache.blogs = null;
      setDeleteTargetId(null);
      fetchAllPosts();
    } catch (err) {
      alert("Failed executing backend deletion parameters.");
    }
  };

  if (loading) {
    return <div className="text-center p-20 text-on-surface">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary">
      <AnimatePresence>
        {deleteTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteTargetId(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-surface-container-low border border-red-500/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl z-10">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <h3 className="text-xl font-serif font-bold text-on-surface mb-2">Delete Dispatch</h3>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">Are you sure you want to permanently delete this article? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteTargetId(null)} className="flex-1 py-2.5 px-4 rounded-xl border border-outline-variant/20 text-on-surface hover:bg-surface-container transition-colors text-xs font-label uppercase tracking-wider font-bold cursor-pointer">Cancel</button>
                <button type="button" onClick={confirmDelete} className="flex-1 py-2.5 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors text-xs font-label uppercase tracking-wider font-bold shadow-lg shadow-red-500/20 cursor-pointer">Confirm Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="px-4 sm:px-6 md:px-12 pb-20 max-w-7xl mx-auto">
        <div className="mb-8 md:mb-10 pt-4 sm:pt-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-serif leading-tight text-on-surface sm:text-5xl">Club Articles & Dispatches</h1>
            <p className="mt-3 text-sm font-light leading-relaxed text-on-surface-variant/80 sm:text-base">Tournament analysis, opening theory, game recaps, and deep dives from our community.</p>
          </div>
          {isAdmin && (
            <button 
              onClick={() => {
                if (showEditor) {
                  setEditingPostId(null); setNewTitle(""); setNewSubtitle(""); setNewContent(""); setNewCover(""); setNewAuthorName(""); setNewAuthorPosition(""); setNewDate("");
                }
                setShowEditor(!showEditor);
              }} 
              className="bg-primary text-[#3c2f00] hover:bg-[#d4af37] px-6 py-2.5 rounded-xl font-bold text-xs font-label uppercase tracking-widest transition-colors shadow-lg shrink-0 cursor-pointer flex items-center gap-2"
            >

              <span>{showEditor ? "Collapse Drawer" : "+ Draft Article"}</span>
            </button>
          )}
        </div>

        {error && <div className="text-red-500 bg-red-500/10 p-4 rounded-xl text-center mb-6 font-semibold">{error}</div>}

        {isAdmin && showEditor && (
          <div className="mb-12 bg-surface-container-low p-6 sm:p-8 rounded-2xl border border-outline-variant/20 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-serif font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">{editingPostId ? 'edit_document' : 'post_add'}</span>
                  {editingPostId ? "Modify Existing Dispatch" : "Author New Dispatch Entry"}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  {editingPostId ? `Updating record (ID: ${editingPostId}). Changes are committed to cloud storage instantly.` : "Publish news, match recaps, or analytics directly to the live feed."}
                </p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-outline-variant/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Article Headline Title" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface" />
                <input type="text" placeholder="Subtitle / Short Excerpt Description" value={newSubtitle} onChange={(e) => setNewSubtitle(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select value={newTag} onChange={(e) => setNewTag(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface">
                  <option value="Tournament News">Tournament News</option>
                  <option value="Event Recap">Event Recap</option>
                  <option value="Puzzle Analytics">Puzzle Analytics</option>
                </select>
                <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 px-3 py-1.5 rounded-xl">
                  <input type="text" placeholder="Banner Graphic URL" value={newCover} onChange={(e) => setNewCover(e.target.value)} className="flex-grow bg-transparent text-sm text-on-surface focus:outline-none py-1.5" />
                  <label className="cursor-pointer bg-primary text-[#3c2f00] hover:bg-primary-container transition-all px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] uppercase font-bold tracking-wider shadow-sm select-none shrink-0">
                    <span className="material-symbols-outlined text-xs">upload</span>
                    <span>Desktop Photo</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <input type="date" placeholder="Article Date (Optional)" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface" />
                  <span className="text-[10px] text-on-surface-variant/50 block mt-1 px-1">Optional — Leave blank to place at the end</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Writer's Name (e.g., Laksh Dhir)" value={newAuthorName} onChange={(e) => setNewAuthorName(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface" />
                <input type="text" placeholder="Writer's Position (e.g., Coordinator, Chess Club)" value={newAuthorPosition} onChange={(e) => setNewAuthorPosition(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-xl text-sm focus:outline-primary text-on-surface" />
              </div>
              <textarea placeholder="Body Content String (Supports HTML markup tags or basic lines)" required rows="8" value={newContent} onChange={(e) => setNewContent(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 p-4 rounded-xl text-sm focus:outline-primary text-on-surface font-mono" />
              <button type="submit" className="w-full bg-[#f2ca50] text-[#3c2f00] py-3 rounded-xl text-xs font-label uppercase tracking-widest font-bold hover:bg-[#d4af37] transition-colors cursor-pointer">
                {editingPostId ? "Save Changes" : "Publish Document Row"}
              </button>
            </form>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-12 mt-8">
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
                    {year === 'Club History' ? 'history' : 'calendar_month'}
                  </span>
                  {year}
                </span>
                {selectedYear === year && (
                  <span className="material-symbols-outlined relative z-10 text-[18px]">chevron_right</span>
                )}
                {selectedYear !== year && (
                  <div className="absolute inset-0 bg-primary/5 translate-x-[-100%] group-hover:translate-x-[0%] transition-transform duration-500 ease-out"></div>
                )}
              </button>
            ))}
          </div>

          <div className="w-full md:w-3/4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-outline-variant/20 pb-4">
              <h3 className="text-3xl sm:text-4xl font-serif font-bold text-on-surface">{selectedYear} Dispatches</h3>
              <div className="flex space-x-2">
                <button type="button" onClick={() => setViewMode('grid')} className={`p-2 border rounded-md transition-colors cursor-pointer ${viewMode === 'grid' ? 'border-primary text-primary bg-primary/10' : 'border-outline-variant/20 text-on-surface-variant hover:text-on-surface'}`} title="Grid View">
                  <span className="material-symbols-outlined">grid_view</span>
                </button>
                <button type="button" onClick={() => setViewMode('list')} className={`p-2 border rounded-md transition-colors cursor-pointer ${viewMode === 'list' ? 'border-primary text-primary bg-primary/10' : 'border-outline-variant/20 text-on-surface-variant hover:text-on-surface'}`} title="List View">
                  <span className="material-symbols-outlined">view_agenda</span>
                </button>
              </div>
            </div>

            {filteredPosts.length === 0 ? (
              <p className="text-gray-500 italic py-8">No articles found for {selectedYear}.</p>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col space-y-6"}>
                {filteredPosts.map((post, idx) => (
                  <div key={`${post.id}-${idx}`} className="h-full relative group">
                    {isAdmin && post.author_email && (
                      <div className="absolute top-4 right-4 z-30 flex gap-2">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartEdit(post); }} className="p-2 bg-black/80 backdrop-blur-md rounded-full text-yellow-400 hover:scale-105 border border-outline-variant/15 opacity-80 group-hover:opacity-100 transition-all shadow-lg cursor-pointer" title="Edit Dispatch">
                          <span className="material-symbols-outlined text-xs">edit</span>
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTargetId(post.id); }} className="p-2 bg-black/80 backdrop-blur-md rounded-full text-red-500 hover:scale-105 border border-outline-variant/15 opacity-80 group-hover:opacity-100 transition-all shadow-lg cursor-pointer" title="Delete Dispatch">
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    )}
                    <Link to={`/blog/${post.id}`} className={`flex bg-surface-container-low border border-outline-variant/10 rounded-2xl overflow-hidden hover:border-outline-variant/30 hover:shadow-xl transition-all duration-300 h-full ${viewMode === 'grid' ? 'flex-col' : 'flex-col md:flex-row'}`}>
                      <div className={`overflow-hidden relative ${viewMode === 'grid' ? 'aspect-[3/4] w-full' : 'aspect-[3/4] w-40 flex-shrink-0'}`}>
                        <img alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={getImageUrl(post.cover_image || post.image)} onError={(e) => { e.currentTarget.src = defaultBlogHero; }} />
                        <div className="absolute top-3 left-3">
                          <span className="bg-surface/90 backdrop-blur-md px-3 py-1 text-[9px] font-label tracking-widest uppercase text-primary font-bold rounded-md shadow-sm">{getBlogTag(post)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col flex-grow p-5 sm:p-6">
                        <span className="text-[10px] font-label text-on-surface-variant/70 uppercase mb-2">
                          {formatBlogDate(post.created_at || post.date) ? `${formatBlogDate(post.created_at || post.date)} • ${calculateReadTime(post.content)}` : calculateReadTime(post.content)}
                        </span>
                        <h4 className="text-lg font-serif font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">{post.title}</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 mb-6 font-light">{getBlogExcerpt(post, 120)}</p>
                        <div className="mt-auto flex items-center justify-between border-t border-outline-variant/10 pt-3">
                          <span className="text-[10px] font-label text-on-surface-variant/80 uppercase">By {post.author_name || post.author || "Chess Club Team"}</span>
                          <span className="material-symbols-outlined text-primary text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Blogs;
