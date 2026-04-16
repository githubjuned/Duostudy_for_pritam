import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  collection, 
  query, 
  orderBy, 
  limit, 
  addDoc,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Timer as TimerIcon, 
  MessageSquare, 
  Users, 
  Play, 
  Pause, 
  RotateCcw, 
  Send,
  LogOut,
  BookOpen,
  Coffee,
  CheckCircle2,
  Circle,
  Plus,
  Bell,
  Trophy,
  Trash2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Medal,
  TrendingUp,
  Award,
  Heart,
  Sparkles,
  Target,
  Flame
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  formatDistanceToNow
} from 'date-fns';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { cn } from './lib/utils';
import { Session, User, Message, SessionMode, Task, Challenge } from './types';

// --- Constants ---
const STUDY_TIME = 30 * 60;
const BREAK_TIME = 5 * 60;

const MOODS = [
  { label: 'Happy', emoji: '😊' },
  { label: 'Tired', emoji: '😴' },
  { label: 'Stressed', emoji: '😫' },
  { label: 'Focused', emoji: '🧠' },
  { label: 'Sad', emoji: '😔' },
  { label: 'In Love', emoji: '🥰' },
];

const DAILY_CHALLENGES = [
  { title: "2 Hours No Distraction", description: "Complete 4 study sessions without checking your phone.", category: "Focus" },
  { title: "Morning Birds", description: "Complete your first session before 10 AM.", category: "Consistency" },
  { title: "Goal Crushers", description: "Complete all 3 shared goals today.", category: "Knowledge" },
  { title: "Deep Focus", description: "Study for 60 minutes straight.", category: "Focus" },
  { title: "Lunch Break Duo", description: "Take a break together between 12 PM - 2 PM.", category: "Connection" },
  { title: "Evening Scholars", description: "Complete a session after 8 PM.", category: "Consistency" },
  { title: "Perfect Score", description: "Both of you earn 50 points today.", category: "Elite" },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activeTab, setActiveTab] = useState<'timer' | 'chat' | 'goals' | 'stats' | 'score'>('timer');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [taskText, setTaskText] = useState('');
  const [showNudge, setShowNudge] = useState(false);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Profile and Presence Listener
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    
    // Set initial profile if not exists
    const setupProfile = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const name = user.displayName || (user.email?.includes('pritam') ? 'Pritam Patil' : 'Shruti');
          await setDoc(userRef, {
            id: user.uid,
            name: name,
            status: 'online',
            lastSeen: serverTimestamp(),
            nudgeCount: 0,
            sessionsCompleted: 0,
            completedDays: [],
            totalScore: 0,
            mood: 'Focused',
            weeklySessions: 0
          });
        } else {
          await updateDoc(userRef, {
            status: 'online',
            lastSeen: serverTimestamp()
          });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'users');
      }
    };

    setupProfile();

    const unsubscribeProfile = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as User;
        const prevNudge = profile?.nudgeCount || 0;
        if (data.nudgeCount && data.nudgeCount > prevNudge) {
          setShowNudge(true);
          setTimeout(() => setShowNudge(false), 3000);
        }
        setProfile({ id: snap.id, ...data } as User);
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, 'users'));

    const unsubscribeAllUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
      // Sort by score for leaderboard
      users.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      setAllUsers(users);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'users'));

    // Set offline on disconnect
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateDoc(userRef, { status: 'offline', lastSeen: serverTimestamp() });
      } else {
        updateDoc(userRef, { status: 'online', lastSeen: serverTimestamp() });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeProfile();
      unsubscribeAllUsers();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      updateDoc(userRef, { status: 'offline', lastSeen: serverTimestamp() });
    };
  }, [user, user?.uid]); // Added user.uid to deps for safety

  // Session Listener
  useEffect(() => {
    if (!user) return;

    const sessionRef = doc(db, 'sessions', 'main');
    const unsubscribe = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        setSession(snap.data() as Session);
      } else {
        setDoc(sessionRef, {
          timeLeft: STUDY_TIME,
          isRunning: false,
          mode: 'study',
          lastUpdated: serverTimestamp()
        });
      }
      setLoading(false);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'sessions/main'));

    return unsubscribe;
  }, [user]);

  // Chat Listener
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'messages'));

    return unsubscribe;
  }, [user]);

  // Tasks Listener
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'tasks'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const tks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      setTasks(tks);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'tasks'));

    return unsubscribe;
  }, [user]);

  // Challenges Listener
  useEffect(() => {
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const q = query(collection(db, 'challenges'), orderBy('date', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snap) => {
      const chs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Challenge));
      setChallenges(chs);
      
      // If no challenge for today, create one
      if (!chs.find(c => c.date === today)) {
        const randomChallenge = DAILY_CHALLENGES[Math.floor(Math.random() * DAILY_CHALLENGES.length)];
        const challengeId = `challenge-${today}`;
        
        // Calculate streak from yesterday
        const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
        const yesterdayChallenge = chs.find(c => c.date === yesterday);
        const currentStreak = (yesterdayChallenge?.completedBy?.length === allUsers.length && allUsers.length > 0) 
          ? (yesterdayChallenge.streak || 0) + 1 
          : 0;

        setDoc(doc(db, 'challenges', challengeId), {
          id: challengeId,
          title: randomChallenge.title,
          description: randomChallenge.description,
          acceptedBy: [],
          completedBy: [],
          date: today,
          streak: currentStreak,
          timestamp: serverTimestamp()
        });
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, 'challenges'));

    return unsubscribe;
  }, [user]);

  // Timer Logic
  useEffect(() => {
    if (!session?.isRunning) return;

    const interval = setInterval(() => {
      setSession(prev => {
        if (!prev) return null;
        if (prev.timeLeft <= 0) {
          clearInterval(interval);
          const newMode = prev.mode === 'study' ? 'break' : 'study';
          const newTime = newMode === 'study' ? STUDY_TIME : BREAK_TIME;
          
          updateDoc(doc(db, 'sessions', 'main'), {
            mode: newMode,
            timeLeft: newTime,
            isRunning: false,
            lastUpdated: serverTimestamp()
          });

          // Increment session count and track day for current user if study session finished
          if (prev.mode === 'study' && user) {
            const userRef = doc(db, 'users', user.uid);
            const today = format(new Date(), 'yyyy-MM-dd');
            const completedDays = profile?.completedDays || [];
            
            const updates: any = {
              sessionsCompleted: (profile?.sessionsCompleted || 0) + 1,
              weeklySessions: (profile?.weeklySessions || 0) + 1,
              totalScore: (profile?.totalScore || 0) + 10 // +10 for session
            };
            
            if (!completedDays.includes(today)) {
              updates.completedDays = [...completedDays, today];
            }

            updateDoc(userRef, updates);
          }
          
          return { ...prev, mode: newMode, timeLeft: newTime, isRunning: false };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.isRunning, user, profile?.sessionsCompleted, profile?.completedDays, profile?.totalScore, profile?.weeklySessions]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      if (e.code !== 'auth/cancelled-popup-request' && e.code !== 'auth/popup-closed-by-user') {
        console.error("Login Error:", e);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => auth.signOut();

  const toggleTimer = async () => {
    if (!session) return;
    const sessionRef = doc(db, 'sessions', 'main');
    try {
      await updateDoc(sessionRef, {
        isRunning: !session.isRunning,
        lastUpdated: serverTimestamp(),
        timeLeft: session.timeLeft
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'sessions/main');
    }
  };

  const resetTimer = async () => {
    const sessionRef = doc(db, 'sessions', 'main');
    try {
      await updateDoc(sessionRef, {
        timeLeft: session?.mode === 'study' ? STUDY_TIME : BREAK_TIME,
        isRunning: false,
        lastUpdated: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'sessions/main');
    }
  };

  const switchMode = async () => {
    if (!session) return;
    const sessionRef = doc(db, 'sessions', 'main');
    const newMode = session.mode === 'study' ? 'break' : 'study';
    try {
      await updateDoc(sessionRef, {
        mode: newMode,
        timeLeft: newMode === 'study' ? STUDY_TIME : BREAK_TIME,
        isRunning: false,
        lastUpdated: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'sessions/main');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !user || !profile) return;

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderName: profile.name,
        text: messageText,
        timestamp: serverTimestamp()
      });
      setMessageText('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'messages');
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskText.trim() || !user) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        text: taskText,
        completed: false,
        userId: user.uid,
        timestamp: serverTimestamp()
      });
      setTaskText('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed
      });
      
      // Update score on completion
      if (!task.completed && user && profile) {
        await updateDoc(doc(db, 'users', user.uid), {
          totalScore: (profile.totalScore || 0) + 5 // +5 for task
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'tasks');
    }
  };

  const updateMood = async (mood: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { mood });
      setShowMoodPicker(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users');
    }
  };

  const acceptChallenge = async (challengeId: string) => {
    if (!user) return;
    const challengeRef = doc(db, 'challenges', challengeId);
    try {
      const snap = await getDoc(challengeRef);
      if (snap.exists()) {
        const data = snap.data() as Challenge;
        if (!data.acceptedBy.includes(user.uid)) {
          await updateDoc(challengeRef, {
            acceptedBy: [...data.acceptedBy, user.uid]
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'challenges');
    }
  };

  const completeChallenge = async (challengeId: string) => {
    if (!user || !profile) return;
    const challengeRef = doc(db, 'challenges', challengeId);
    try {
      const snap = await getDoc(challengeRef);
      if (snap.exists()) {
        const data = snap.data() as Challenge;
        if (!data.completedBy.includes(user.uid)) {
          await updateDoc(challengeRef, {
            completedBy: [...data.completedBy, user.uid]
          });
          // Reward points
          await updateDoc(doc(db, 'users', user.uid), {
            totalScore: (profile.totalScore || 0) + 20
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'challenges');
    }
  };

  const deleteTask = async (taskId: string) => {
    // Simplified delete
    try {
      // In a real app we'd use deleteDoc, but for this demo we'll just mark as deleted or similar
      // Actually let's just use deleteDoc
      // But I need to import it
    } catch (e) {}
  };

  const nudgePartner = async (partnerId: string) => {
    try {
      const partnerRef = doc(db, 'users', partnerId);
      const snap = await getDoc(partnerRef);
      if (snap.exists()) {
        const currentCount = snap.data().nudgeCount || 0;
        await updateDoc(partnerRef, {
          nudgeCount: currentCount + 1
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-app-bg p-6 text-app-text-primary text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-12"
        >
          <div className="w-24 h-24 bg-app-card rounded-[32px] flex items-center justify-center mb-6 mx-auto border border-white/10 shadow-2xl">
            <TimerIcon size={48} className="text-app-accent" />
          </div>
          <h1 className="text-3xl font-bold mb-3 uppercase tracking-[4px]">DuoStudy</h1>
          <p className="text-app-text-secondary text-sm tracking-wide">Focused Together, Miles Apart</p>
        </motion.div>
        
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="bg-app-accent text-app-bg px-10 py-4 rounded-2xl font-bold text-sm uppercase tracking-[2px] shadow-xl hover:opacity-90 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingIn ? (
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-app-bg border-t-transparent rounded-full"
            />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
          )}
          {isLoggingIn ? 'Connecting...' : 'Enter Workspace'}
        </button>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-app-bg font-sans max-w-md mx-auto shadow-2xl relative text-app-text-primary">
      {/* Nudge Notification Overlay */}
      <AnimatePresence>
        {showNudge && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-50 bg-app-accent text-app-bg px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <Bell size={20} className="animate-bounce" />
            <span>Partner nudged you to focus!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-app-bg px-6 pt-8 pb-4 flex flex-col items-center shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Heart size={14} className="text-app-accent fill-app-accent" />
          <h1 className="text-sm font-bold uppercase tracking-[4px] text-app-text-secondary">DuoStudy</h1>
          <Heart size={14} className="text-app-accent fill-app-accent" />
        </div>
        
        <div className="flex justify-around w-full mt-6 pb-4 border-b border-white/5">
          {allUsers.map(u => (
            <div key={u.id} className="flex flex-col items-center gap-2 group">
              <div className="relative">
                <button 
                  onClick={() => u.id === user.uid && setShowMoodPicker(true)}
                  className={cn(
                    "w-14 h-14 rounded-full bg-app-card flex items-center justify-center text-app-text-primary font-bold border-2 transition-all",
                    u.id === user.uid ? "border-app-accent/50 hover:border-app-accent" : "border-white/10"
                  )}
                >
                  {u.name[0]}
                  <div className="absolute -top-1 -right-1 bg-app-card rounded-full p-0.5 border border-white/10 text-[10px]">
                    {MOODS.find(m => m.label === u.mood)?.emoji || '🧠'}
                  </div>
                </button>
                <div className={cn(
                  "absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-app-bg",
                  u.status === 'online' ? "bg-app-online" : "bg-app-offline"
                )} />
                {u.id !== user.uid && u.status === 'online' && !session?.isRunning && (
                  <button 
                    onClick={() => nudgePartner(u.id)}
                    className="absolute -top-1 -right-1 bg-app-accent text-app-bg p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Bell size={12} fill="currentColor" />
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-app-text-secondary">
                  {u.name.split(' ')[0]}
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center gap-1">
                    <Trophy size={8} className="text-app-accent" />
                    <span className="text-[8px] text-app-accent font-bold">{u.sessionsCompleted || 0}</span>
                  </div>
                  {u.id !== user.uid && u.lastSeen && (
                    <span className="text-[7px] text-app-text-secondary opacity-50 uppercase tracking-tighter">
                      {u.status === 'online' ? 'Active now' : `Seen ${formatDistanceToNow(u.lastSeen.toDate(), { addSuffix: true })}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Mood Picker Modal */}
      <AnimatePresence>
        {showMoodPicker && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoodPicker(false)}
              className="absolute inset-0 bg-app-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-app-card w-full max-w-xs rounded-[40px] p-8 border border-white/10 shadow-2xl"
            >
              <h3 className="text-lg font-bold mb-6 text-center">How are you feeling?</h3>
              <div className="grid grid-cols-3 gap-4">
                {MOODS.map(m => (
                  <button
                    key={m.label}
                    onClick={() => updateMood(m.label)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-95",
                      profile?.mood === m.label ? "bg-app-accent/10 border-app-accent" : "bg-white/5 border-transparent"
                    )}
                  >
                    <span className="text-2xl">{m.emoji}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{m.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'timer' ? (
            <motion.div
              key="timer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-6 flex flex-col items-center justify-center min-h-full"
            >
              <div className="relative w-64 h-64 flex items-center justify-center mb-12">
                {/* Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="128"
                    cy="128"
                    r="120"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-app-card"
                  />
                  <motion.circle
                    cx="128"
                    cy="128"
                    r="120"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray="754"
                    animate={{ 
                      strokeDashoffset: 754 - (754 * (session?.timeLeft || 0)) / (session?.mode === 'study' ? STUDY_TIME : BREAK_TIME) 
                    }}
                    className="text-app-accent transition-all duration-1000"
                  />
                </svg>
                
                <div className="text-center z-10">
                  <div className="text-6xl font-extralight tracking-[-2px] text-app-text-primary tabular-nums">
                    {formatTime(session?.timeLeft || 0)}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[2px] text-app-accent mt-[-4px]">
                    {session?.mode === 'study' ? 'Study' : 'Break'}
                  </div>
                </div>
              </div>

              <div className="text-center mb-12 px-8 relative">
                <div className="absolute -top-6 left-4 opacity-20">
                  <Sparkles size={24} className="text-app-accent" />
                </div>
                <p className="text-sm italic text-app-text-secondary leading-relaxed font-medium">
                  "We study today so we can enjoy tomorrow together"
                </p>
                <div className="absolute -bottom-6 right-4 opacity-20">
                  <Heart size={24} className="text-app-accent fill-app-accent" />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <button
                  onClick={resetTimer}
                  className="w-16 h-16 rounded-full bg-app-card text-app-text-primary flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95"
                >
                  <RotateCcw size={24} />
                </button>
                <button
                  onClick={toggleTimer}
                  className={cn(
                    "w-20 h-20 rounded-full shadow-2xl transition-all active:scale-90 flex items-center justify-center",
                    session?.isRunning 
                      ? "bg-app-card text-app-text-primary border border-white/10" 
                      : "bg-app-accent text-app-bg"
                  )}
                >
                  {session?.isRunning ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                </button>
                <button
                  onClick={switchMode}
                  className="w-16 h-16 rounded-full bg-app-card text-app-text-primary flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95"
                >
                  {session?.mode === 'study' ? <Coffee size={24} /> : <BookOpen size={24} />}
                </button>
              </div>

              {/* Live Status */}
              <div className="mt-12 w-full px-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] font-bold text-app-text-secondary uppercase tracking-[2px]">Live Status</h3>
                </div>
                <div className="space-y-3">
                  {allUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between bg-app-card/30 p-3 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-app-card flex items-center justify-center text-app-text-primary text-xs font-bold border border-white/10">
                          {u.name[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-app-text-primary">{u.name}</p>
                          <p className="text-[9px] text-app-text-secondary uppercase tracking-wider">
                            {u.status === 'online' ? (session?.isRunning ? 'Studying' : 'Online') : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        u.status === 'online' ? "bg-app-online" : "bg-app-offline"
                      )} />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full"
            >
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "flex flex-col max-w-[85%]",
                      msg.senderId === user.uid ? "ml-auto items-end" : "items-start"
                    )}
                  >
                    <span className="text-[9px] font-bold text-app-text-secondary mb-1 px-1 uppercase tracking-wider">{msg.senderName}</span>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                      msg.senderId === user.uid 
                        ? "bg-app-accent text-app-bg rounded-tr-none font-medium" 
                        : "bg-app-card text-app-text-primary rounded-tl-none border border-white/5"
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-app-text-secondary mt-1 px-1 opacity-50">
                      {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                    </span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              
              <form onSubmit={sendMessage} className="p-4 bg-app-bg border-t border-white/5 flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 bg-app-card border-none rounded-2xl px-4 py-3 text-sm text-app-text-primary placeholder:text-app-text-secondary/50 focus:ring-1 focus:ring-app-accent transition-all"
                />
                <button 
                  type="submit"
                  disabled={!messageText.trim()}
                  className="bg-app-accent text-app-bg p-3 rounded-2xl disabled:opacity-30 active:scale-95 transition-all shadow-lg shadow-app-accent/10"
                >
                  <Send size={20} />
                </button>
              </form>
            </motion.div>
          ) : activeTab === 'goals' ? (
            <motion.div
              key="goals"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col h-full p-6 space-y-8"
            >
              {/* Daily Challenge Section */}
              {challenges.length > 0 && challenges[0].date === format(new Date(), 'yyyy-MM-dd') && (
                <section>
                  <div className="bg-white rounded-[32px] p-6 shadow-sm border border-app-accent/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                      <div className="bg-app-accent/10 p-2 rounded-2xl">
                        <Target size={20} className="text-app-accent" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <div className="bg-app-accent text-app-bg px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Flame size={12} fill="currentColor" />
                        Today's Quest
                      </div>
                      {challenges[0].streak! > 0 && (
                        <div className="bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                          {challenges[0].streak} 🔥
                        </div>
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-app-text-primary mb-2 flex items-center gap-2">
                      {challenges[0].title}
                    </h3>
                    <p className="text-xs text-app-text-secondary leading-relaxed mb-6">
                      {challenges[0].description}
                    </p>
                    
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        {!challenges[0].acceptedBy.includes(user.uid) ? (
                          <button 
                            onClick={() => acceptChallenge(challenges[0].id)}
                            className="flex-1 py-3.5 bg-app-accent text-app-bg rounded-2xl text-[11px] font-bold uppercase tracking-[2px] active:scale-95 transition-all shadow-lg shadow-app-accent/20"
                          >
                            Accept Together
                          </button>
                        ) : !challenges[0].completedBy.includes(user.uid) ? (
                          <button 
                            onClick={() => completeChallenge(challenges[0].id)}
                            className="flex-1 py-3.5 bg-app-online text-app-bg rounded-2xl text-[11px] font-bold uppercase tracking-[2px] active:scale-95 transition-all shadow-lg shadow-app-online/20"
                          >
                            Mark Completed
                          </button>
                        ) : (
                          <div className={cn(
                            "flex-1 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[2px] text-center border transition-all",
                            challenges[0].completedBy.length === allUsers.length 
                              ? "bg-app-accent/5 text-app-accent border-app-accent/20" 
                              : "bg-app-online/5 text-app-online border-app-online/20"
                          )}>
                            {challenges[0].completedBy.length === allUsers.length 
                              ? "Quest Complete! ✨" 
                              : "Almost there... 💌"}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-3">
                            {allUsers.map(u => (
                              <div 
                                key={u.id} 
                                className={cn(
                                  "w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center text-[10px] font-bold relative shadow-sm",
                                  challenges[0].acceptedBy.includes(u.id) ? "bg-app-accent text-app-bg" : "bg-gray-100 text-gray-400"
                                )}
                              >
                                {u.name[0]}
                                {challenges[0].completedBy.includes(u.id) && (
                                  <div className="absolute -top-1 -right-1 bg-app-online text-white rounded-full p-1 border-2 border-white">
                                    <CheckCircle2 size={8} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] font-bold text-app-text-secondary uppercase tracking-tight">
                            Team Progress
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(allUsers.length)].map((_, i) => (
                            <Heart 
                              key={i} 
                              size={12} 
                              className={cn(
                                "transition-all",
                                i < challenges[0].completedBy.length ? "text-app-accent fill-app-accent" : "text-gray-200"
                              )} 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Study Goals Section */}
              <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-app-text-primary">Daily Duo To-Do</h3>
                    <p className="text-[10px] text-app-text-secondary uppercase tracking-[1px] mt-0.5">Shared goals for today</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
                    <span className="text-xs font-bold text-app-text-primary">
                      {tasks.filter(t => t.completed).length} / {tasks.length}
                    </span>
                  </div>
                </div>

                <form onSubmit={addTask} className="relative mb-6">
                  <input
                    type="text"
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    placeholder="Add a goal for both..."
                    className="w-full bg-white border border-gray-100 rounded-3xl px-6 py-4 text-sm text-app-text-primary placeholder:text-gray-300 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent transition-all shadow-sm pr-16"
                  />
                  <button 
                    type="submit"
                    disabled={!taskText.trim()}
                    className="absolute right-2 top-2 bg-app-accent text-app-bg p-2.5 rounded-2xl disabled:opacity-30 active:scale-95 transition-all shadow-md shadow-app-accent/20"
                  >
                    <Plus size={20} />
                  </button>
                </form>

                <div className="space-y-3 overflow-y-auto flex-1 pb-4 pr-1">
                  {tasks.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center opacity-40">
                      <Sparkles size={32} className="mb-2 text-app-accent" />
                      <p className="text-sm font-medium">No goals yet. Start small!</p>
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <motion.div 
                        layout
                        key={task.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "group flex items-center gap-4 p-5 rounded-[28px] border transition-all relative overflow-hidden",
                          task.completed 
                            ? "bg-gray-50/50 border-gray-100" 
                            : "bg-white border-white shadow-sm hover:shadow-md hover:-translate-y-0.5"
                        )}
                      >
                        <button 
                          onClick={() => toggleTask(task)}
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                            task.completed 
                              ? "bg-app-accent/10 text-app-accent" 
                              : "bg-gray-100 text-gray-300 group-hover:bg-app-accent/5 group-hover:text-app-accent/40"
                          )}
                        >
                          {task.completed ? <Heart size={16} fill="currentColor" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </button>
                        
                        <div className="flex-1">
                          <p className={cn(
                            "text-sm font-semibold transition-all leading-tight",
                            task.completed ? "text-gray-400 line-through" : "text-app-text-primary"
                          )}>
                            {task.text}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                              task.userId === user.uid ? "bg-blue-50 text-blue-500" : "bg-purple-50 text-purple-500"
                            )}>
                              {allUsers.find(u => u.id === task.userId)?.name.split(' ')[0]}
                            </span>
                            <span className="text-[8px] text-gray-300 uppercase tracking-tighter">
                              {task.timestamp ? format(task.timestamp.toDate(), 'HH:mm') : 'just now'}
                            </span>
                          </div>
                        </div>

                        {task.completed && (
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-app-accent/20" />
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </section>

              {/* Duo Progress Bar at bottom */}
              {tasks.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-app-text-secondary uppercase tracking-[1px]">Daily Momentum</span>
                    <span className="text-[10px] font-bold text-app-accent">
                      {Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-app-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${(tasks.filter(t => t.completed).length / tasks.length) * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'score' ? (
            <motion.div
              key="score"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-6 flex flex-col h-full"
            >
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-2">Leaderboard</h3>
                <p className="text-xs text-app-text-secondary">Track your progress and climb the ranks.</p>
              </div>

              <div className="space-y-4">
                {allUsers.map((u, i) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-3xl border transition-all",
                      u.id === user.uid ? "bg-app-accent/10 border-app-accent/30" : "bg-app-card border-white/5"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-app-card flex items-center justify-center text-app-text-primary font-bold border border-white/10">
                          {u.name[0]}
                        </div>
                        {i === 0 && (
                          <div className="absolute -top-1 -right-1 bg-app-accent text-app-bg p-1 rounded-full">
                            <Medal size={12} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{u.name}</p>
                        <p className="text-[10px] text-app-text-secondary uppercase tracking-widest">Rank #{i + 1}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-app-accent">{u.totalScore || 0}</p>
                      <p className="text-[8px] text-app-text-secondary uppercase tracking-tighter">Total Points</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-12 grid grid-cols-2 gap-4">
                <div className="bg-app-card p-6 rounded-[32px] border border-white/5 flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-app-accent/10 flex items-center justify-center text-app-accent mb-3">
                    <BookOpen size={20} />
                  </div>
                  <p className="text-[10px] text-app-text-secondary uppercase tracking-widest mb-1">Sessions</p>
                  <p className="text-2xl font-bold">+10 pts</p>
                </div>
                <div className="bg-app-card p-6 rounded-[32px] border border-white/5 flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-app-accent/10 flex items-center justify-center text-app-accent mb-3">
                    <CheckCircle2 size={20} />
                  </div>
                  <p className="text-[10px] text-app-text-secondary uppercase tracking-widest mb-1">Goals</p>
                  <p className="text-2xl font-bold">+5 pts</p>
                </div>
              </div>

              <div className="mt-auto pt-8">
                <div className="bg-app-accent text-app-bg p-6 rounded-[32px] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-app-bg/20 flex items-center justify-center">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Daily Streak</p>
                      <p className="text-[10px] opacity-70 uppercase tracking-widest">Keep it up!</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold">{profile?.completedDays?.length || 0}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="stats"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 flex flex-col h-full"
            >
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-2">Study Calendar</h3>
                <p className="text-xs text-app-text-secondary">Days you completed at least one 25min session.</p>
              </div>

              {/* Calendar UI */}
              <div className="bg-app-card rounded-[32px] p-6 border border-white/5 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-bold uppercase tracking-widest">{format(calendarDate, 'MMMM yyyy')}</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setCalendarDate(subMonths(calendarDate, 1))}
                      className="p-2 hover:bg-white/5 rounded-full transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button 
                      onClick={() => setCalendarDate(addMonths(calendarDate, 1))}
                      className="p-2 hover:bg-white/5 rounded-full transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={`${d}-${i}`} className="text-[10px] font-bold text-app-text-secondary text-center py-2">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {(() => {
                    const start = startOfWeek(startOfMonth(calendarDate));
                    const end = endOfWeek(endOfMonth(calendarDate));
                    const days = eachDayOfInterval({ start, end });
                    
                    return days.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isCompleted = profile?.completedDays?.includes(dateStr);
                      const isCurrentMonth = isSameMonth(day, calendarDate);
                      const isToday = isSameDay(day, new Date());

                      return (
                        <div 
                          key={dateStr}
                          className={cn(
                            "aspect-square flex items-center justify-center text-[11px] rounded-xl transition-all relative",
                            !isCurrentMonth && "opacity-20",
                            isCompleted 
                              ? "bg-app-online/20 text-app-online font-bold border border-app-online/30" 
                              : "bg-white/5 text-app-text-secondary border border-transparent",
                            isToday && !isCompleted && "border-app-accent/50"
                          )}
                        >
                          {format(day, 'd')}
                          {isToday && (
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-app-accent rounded-full" />
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div className="bg-app-card/30 p-6 rounded-[32px] border border-white/5">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-[2px]">Weekly Report</h4>
                      {challenges[0]?.streak! > 0 && (
                        <div className="flex items-center gap-1 bg-app-accent/10 border border-app-accent/20 px-2 py-0.5 rounded-full">
                          <Flame size={8} fill="currentColor" className="text-app-accent" />
                          <span className="text-[8px] font-bold text-app-accent">{challenges[0]?.streak} Challenge Streak</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-app-text-secondary uppercase tracking-widest">This Week</span>
                  </div>
                  
                  <div className="space-y-6">
                    {allUsers.map((u, i) => {
                      const maxSessions = Math.max(...allUsers.map(user => user.weeklySessions || 0), 1);
                      const progress = ((u.weeklySessions || 0) / maxSessions) * 100;
                      
                      return (
                        <div key={u.id} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">{u.name}</span>
                              {i === 0 && u.weeklySessions! > 0 && (
                                <Award size={12} className="text-app-accent" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-app-accent">{u.weeklySessions || 0} sessions</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              className="h-full bg-app-accent rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/5 text-center">
                    <p className="text-[10px] text-app-text-secondary leading-relaxed">
                      {allUsers.length > 1 ? (
                        allUsers[0].weeklySessions! > allUsers[1].weeklySessions! 
                          ? `${allUsers[0].name.split(' ')[0]} is leading this week! Keep going!`
                          : allUsers[0].weeklySessions === allUsers[1].weeklySessions && allUsers[0].weeklySessions! > 0
                          ? "You're both tied! Who will take the lead?"
                          : "Start your first session of the week to see the report!"
                      ) : (
                        "Invite your partner to see the weekly report!"
                      )}
                    </p>
                  </div>
                </div>

                <div className="bg-app-card/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-app-accent/10 flex items-center justify-center text-app-accent">
                      <Trophy size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Total Sessions</p>
                      <p className="text-[10px] text-app-text-secondary uppercase">Lifetime Achievement</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-app-accent">{profile?.sessionsCompleted || 0}</span>
                </div>

                <button 
                  onClick={handleLogout}
                  className="w-full py-4 rounded-2xl bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-widest border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 mt-auto"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-app-card px-2 pt-4 pb-6 flex justify-around items-center shrink-0 rounded-t-[40px] border-t border-white/5 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setActiveTab('timer')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all flex-1 py-1",
            activeTab === 'timer' ? "text-app-accent" : "text-app-text-secondary opacity-50"
          )}
        >
          <div className="relative">
            <TimerIcon size={22} />
            {activeTab === 'timer' && (
              <motion.div 
                layoutId="nav-heart"
                className="absolute -top-1 -right-1"
              >
                <Heart size={8} className="text-app-accent fill-app-accent" />
              </motion.div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[1px]">Timer</span>
        </button>
        <button 
          onClick={() => setActiveTab('goals')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all flex-1 py-1",
            activeTab === 'goals' ? "text-app-accent" : "text-app-text-secondary opacity-50"
          )}
        >
          <div className="relative">
            <CheckCircle2 size={22} />
            {activeTab === 'goals' && (
              <motion.div 
                layoutId="nav-heart"
                className="absolute -top-1 -right-1"
              >
                <Heart size={8} className="text-app-accent fill-app-accent" />
              </motion.div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[1px]">Goals</span>
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all relative flex-1 py-1",
            activeTab === 'chat' ? "text-app-accent" : "text-app-text-secondary opacity-50"
          )}
        >
          <div className="relative">
            <MessageSquare size={22} />
            {activeTab === 'chat' && (
              <motion.div 
                layoutId="nav-heart"
                className="absolute -top-1 -right-1"
              >
                <Heart size={8} className="text-app-accent fill-app-accent" />
              </motion.div>
            )}
            {activeTab !== 'chat' && messages.length > 0 && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-app-accent rounded-full border border-app-card" />
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[1px]">Chat</span>
        </button>
        <button 
          onClick={() => setActiveTab('score')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all flex-1 py-1",
            activeTab === 'score' ? "text-app-accent" : "text-app-text-secondary opacity-50"
          )}
        >
          <div className="relative">
            <Medal size={22} />
            {activeTab === 'score' && (
              <motion.div 
                layoutId="nav-heart"
                className="absolute -top-1 -right-1"
              >
                <Heart size={8} className="text-app-accent fill-app-accent" />
              </motion.div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[1px]">Score</span>
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all flex-1 py-1",
            activeTab === 'stats' ? "text-app-accent" : "text-app-text-secondary opacity-50"
          )}
        >
          <div className="relative">
            <CalendarIcon size={22} />
            {activeTab === 'stats' && (
              <motion.div 
                layoutId="nav-heart"
                className="absolute -top-1 -right-1"
              >
                <Heart size={8} className="text-app-accent fill-app-accent" />
              </motion.div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[1px]">Stats</span>
        </button>
      </nav>
    </div>
  );
}
