/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { 
  Camera, 
  Keyboard, 
  Users, 
  CheckCircle2, 
  BarChart3, 
  Zap, 
  ArrowRight, 
  MessageSquare,
  Smartphone,
  Database,
  Search,
  Bot,
  Menu,
  X,
  Send,
  LogOut,
  LogIn,
  Plus,
  Minus,
  Grid,
  List,
  AlertCircle,
  Trash2,
  RefreshCcw,
  Info,
  Trophy,
  Mail,
  EyeOff,
  Eye,
  UserX,
  UserCheck,
  ShieldAlert
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

// Firebase
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';

// Gemini
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---

interface Sticker {
  id: string;
  code: string;
  count: number;
  updatedAt: Timestamp;
  number?: number;
}

interface AlbumSection {
  id: string;
  label: string;
  group?: string;
  entries: AlbumEntry[];
}

interface AlbumEntry {
  code: string;
  sectionId: string;
  sectionLabel: string;
  group?: string;
  order: number;
  index: number;
}

const TEAM_GROUPS = [
  { group: 'A', teams: ['MEX', 'RSA', 'KOR', 'CZE'] },
  { group: 'B', teams: ['CAN', 'BIH', 'QAT', 'SUI'] },
  { group: 'C', teams: ['BRA', 'MAR', 'HAI', 'SCO'] },
  { group: 'D', teams: ['USA', 'PAR', 'AUS', 'TUR'] },
  { group: 'E', teams: ['GER', 'CUW', 'CIV', 'ECU'] },
  { group: 'F', teams: ['NED', 'JPN', 'SWE', 'TUN'] },
  { group: 'G', teams: ['BEL', 'EGY', 'IRN', 'NZL'] },
  { group: 'H', teams: ['ESP', 'CPV', 'KSA', 'URU'] },
  { group: 'I', teams: ['FRA', 'SEN', 'IRQ', 'NOR'] },
  { group: 'J', teams: ['ARG', 'ALG', 'AUT', 'JOR'] },
  { group: 'K', teams: ['POR', 'COD', 'UZB', 'COL'] },
  { group: 'L', teams: ['ENG', 'CRO', 'GHA', 'PAN'] },
] as const;

const createSectionEntries = (sectionId: string, limit: number, group?: string): AlbumEntry[] =>
  Array.from({ length: limit }, (_, index) => ({
    code: `${sectionId}-${String(index + 1).padStart(2, '0')}`,
    sectionId,
    sectionLabel: sectionId,
    group,
    order: index + 1,
    index: index + 1,
  }));

const ALBUM_SECTIONS: AlbumSection[] = [
  {
    id: 'FWC',
    label: 'FWC',
    entries: createSectionEntries('FWC', 19),
  },
  {
    id: 'CC',
    label: 'CC',
    entries: createSectionEntries('CC', 12),
  },
  ...TEAM_GROUPS.flatMap(({ group, teams }) =>
    teams.map((team) => ({
      id: team,
      label: team,
      group,
      entries: createSectionEntries(team, 20, group),
    }))
  ),
];

const ALBUM_ENTRIES = ALBUM_SECTIONS.flatMap(section => section.entries);
const TOTAL_STICKERS = ALBUM_ENTRIES.length;
const ALBUM_ENTRY_MAP = new Map(ALBUM_ENTRIES.map(entry => [entry.code, entry]));
const ALBUM_ORDER_MAP = new Map(ALBUM_ENTRIES.map((entry, index) => [entry.code, index]));
const normalizeStickerCode = (value: string) => {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
  const compact = normalized.replace(/-/g, '');
  const match = compact.match(/^([A-Z]{2,3})(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}`;
  }
  return normalized;
};
const getStickerCode = (sticker: Sticker) => normalizeStickerCode(sticker.code ?? String(sticker.number ?? ''));
const compareStickerCodes = (a: string, b: string) => {
  const left = ALBUM_ORDER_MAP.get(a);
  const right = ALBUM_ORDER_MAP.get(b);
  if (left != null && right != null) return left - right;
  if (left != null) return -1;
  if (right != null) return 1;
  return a.localeCompare(b);
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  totalOwned: number;
  totalDuplicates: number;
  hidden?: boolean;
  banned?: boolean;
}

const ADMIN_EMAIL = 'belmonte.matheus@gmail.com';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// --- Error Handling ---

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundary = ({ error }: { error: string | null }) => {
  if (!error) return null;
  
  let displayMessage = "Ocorreu um erro inesperado.";
  try {
    const parsed = JSON.parse(error);
    if (parsed.error.includes("insufficient permissions")) {
      displayMessage = "Você não tem permissão para realizar esta ação. Verifique se está logado corretamente.";
    } else if (parsed.error.includes("offline")) {
      displayMessage = "Você parece estar offline. Verifique sua conexão.";
    } else if (parsed.error.includes("auth/popup-blocked")) {
      displayMessage = "O popup de login foi bloqueado pelo navegador. Por favor, permita popups para este site.";
    } else if (parsed.error.includes("auth/cancelled-popup-request")) {
      displayMessage = "O login foi cancelado ou interrompido. Tente novamente.";
    }
  } catch (e) {
    if (error.includes("auth/popup-blocked")) {
      displayMessage = "O popup de login foi bloqueado pelo navegador. Por favor, permita popups para este site.";
    } else if (error.includes("auth/cancelled-popup-request")) {
      displayMessage = "O login foi cancelado ou interrompido. Tente novamente.";
    } else {
      displayMessage = error;
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] max-w-md animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-md p-4 rounded-2xl flex items-start gap-3 shadow-2xl">
        <AlertCircle className="text-red-500 shrink-0" size={20} />
        <div className="flex-1">
          <p className="text-sm font-bold text-red-500 mb-1">Erro de Sistema</p>
          <p className="text-xs text-white/70 leading-relaxed">{displayMessage}</p>
        </div>
      </div>
    </div>
  );
};

// --- Components ---

const SectionWrapper = ({ children, id, className = "" }: { children: React.ReactNode, id?: string, className?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id={id} ref={ref} className={`py-20 px-6 ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </section>
  );
};

const Navbar = ({ user, onError, activePage, onNavigate }: {
  user: User | null;
  onError: (err: string) => void;
  activePage: 'home' | 'ranking';
  onNavigate: (page: 'home' | 'ranking') => void;
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      console.error("Login failed:", error);
      onError(error.message || String(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const homeLinks = [
    { name: 'Meu Álbum', href: '#album' },
    { name: 'Alfredo Chat', href: '#chat' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-dark-bg/90 backdrop-blur-md border-b border-white/10 py-3' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('home')}>
          <div className="w-10 h-10 bg-football-green rounded-xl flex items-center justify-center shadow-lg shadow-football-green/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Alfredo</span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {user && activePage === 'home' && homeLinks.map((link) => (
            <a key={link.name} href={link.href} className="text-sm font-medium text-white/70 hover:text-football-green transition-colors">
              {link.name}
            </a>
          ))}
          {user && (
            <button
              onClick={() => onNavigate(activePage === 'ranking' ? 'home' : 'ranking')}
              className={`text-sm font-medium transition-colors ${activePage === 'ranking' ? 'text-football-green' : 'text-white/70 hover:text-football-green'}`}
            >
              {activePage === 'ranking' ? '← Voltar' : 'Ranking'}
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                <span className="text-xs font-bold text-white/70">{user.displayName?.split(' ')[0]}</span>
              </div>
              <button onClick={handleLogout} className="text-white/50 hover:text-white transition-colors">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="bg-whatsapp-green hover:bg-whatsapp-green/90 disabled:opacity-50 text-dark-bg font-bold py-2 px-6 rounded-full text-sm transition-all flex items-center gap-2"
            >
              {isLoggingIn ? "Entrando..." : "Entrar"} <LogIn size={16} />
            </button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button className="md:hidden text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-dark-bg border-b border-white/10 overflow-hidden"
          >
            <div className="flex flex-col p-6 gap-4">
              {user && activePage === 'home' && homeLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-white/70"
                >
                  {link.name}
                </a>
              ))}
              {user && (
                <button
                  onClick={() => { onNavigate(activePage === 'ranking' ? 'home' : 'ranking'); setIsMobileMenuOpen(false); }}
                  className="text-left text-lg font-medium text-football-green"
                >
                  {activePage === 'ranking' ? '← Voltar' : 'Ranking'}
                </button>
              )}
              {user ? (
                <button onClick={handleLogout} className="text-left text-lg font-medium text-red-400 flex items-center gap-2">
                  <LogOut size={20} /> Sair
                </button>
              ) : (
                <button onClick={handleLogin} className="bg-whatsapp-green text-dark-bg font-bold py-3 px-6 rounded-xl text-center">
                  Entrar com Google
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const StickerGrid = ({ stickers, onUpdate }: { stickers: Sticker[], onUpdate: (code: string, delta: number) => void }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing' | 'duplicates'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stickerMap = useMemo(() => {
    const map = new Map<string, Sticker>();
    stickers.forEach(s => map.set(getStickerCode(s), s));
    return map;
  }, [stickers]);

  const normalizedSearch = normalizeStickerCode(searchQuery);

  const filteredEntries = useMemo(() => {
    return ALBUM_ENTRIES.filter(entry => {
      const s = stickerMap.get(entry.code);
      const matchesSearch = normalizedSearch === '' || entry.code.includes(normalizedSearch) || entry.sectionId.includes(normalizedSearch);
      if (!matchesSearch) return false;

      if (filter === 'owned') return s && s.count > 0;
      if (filter === 'missing') return !s || s.count === 0;
      if (filter === 'duplicates') return s && s.count > 1;
      return true;
    });
  }, [stickerMap, filter, normalizedSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
            {(['all', 'owned', 'missing', 'duplicates'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === f ? 'bg-football-green text-white' : 'text-white/40 hover:text-white'}`}
              >
                {f === 'all' ? 'Tudo' : f === 'owned' ? 'Tenho' : f === 'missing' ? 'Falta' : 'Repetidas'}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
            <input 
              type="text" 
              placeholder="Buscar código..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-10 py-2 text-xs focus:outline-none focus:border-football-green w-36 sm:w-52 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-white/10 text-football-green' : 'text-white/30'}`}><Grid size={18} /></button>
          <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-white/10 text-football-green' : 'text-white/30'}`}><List size={18} /></button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="py-20 text-center glass-card rounded-3xl border-dashed border-white/10">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search size={24} className="text-white/20" />
          </div>
          <p className="text-white/40 text-sm">Nenhuma figurinha encontrada com esses filtros.</p>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="mt-4 text-football-green text-xs font-bold uppercase tracking-widest hover:underline"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-6">
          {ALBUM_SECTIONS.map(section => {
            const sectionEntries = filteredEntries.filter(entry => entry.sectionId === section.id);
            if (sectionEntries.length === 0) return null;

            return (
              <div key={section.id} className="glass-card rounded-2xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="text-sm font-black tracking-wide text-white">{section.label}</div>
                  {section.group && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-football-green">
                      Grupo {section.group}
                    </span>
                  )}
                  <span className="text-[10px] text-white/40 uppercase tracking-widest">
                    {section.entries.length} figurinhas
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2">
                  {sectionEntries.map(entry => {
                    const s = stickerMap.get(entry.code);
                    const count = s?.count || 0;
                    return (
                      <button
                        key={entry.code}
                        onClick={() => onUpdate(entry.code, 1)}
                        onContextMenu={(e) => { e.preventDefault(); onUpdate(entry.code, -1); }}
                        className={`min-h-14 px-2 py-2 flex flex-col items-center justify-center text-center rounded-lg transition-all relative
                          ${count > 0 ? 'bg-football-green text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}
                          ${count > 1 ? 'ring-1 ring-gold' : ''}
                        `}
                      >
                        <span className="text-[11px] font-black tracking-wide">{entry.sectionId}</span>
                        <span className="text-sm font-bold">{String(entry.index).padStart(2, '0')}</span>
                        {count > 1 && (
                          <span className="absolute -top-1 -right-1 bg-gold text-dark-bg text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
                            {count - 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntries.map(entry => {
            const s = stickerMap.get(entry.code);
            const count = s?.count || 0;
            return (
              <div key={entry.code} className="glass-card p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${count > 0 ? 'bg-football-green text-white' : 'bg-white/5 text-white/20'}`}>
                    {entry.sectionId}
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">{entry.code}{entry.group ? ` - Grupo ${entry.group}` : ''}</div>
                    <div className="text-sm font-bold">{count > 0 ? 'Adquirida' : 'Faltando'}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">{count > 1 ? `${count - 1} repetida(s)` : 'Nenhuma repetida'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onUpdate(entry.code, -1)} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-red-400 transition-colors"><Minus size={16} /></button>
                  <span className="w-4 text-center text-sm font-bold">{count}</span>
                  <button onClick={() => onUpdate(entry.code, 1)} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-football-green transition-colors"><Plus size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TradeModal = ({ currentUserStickers, otherUser, onClose }: {
  currentUserStickers: Sticker[];
  otherUser: UserProfile;
  onClose: () => void;
}) => {
  const [theirStickers, setTheirStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStickers = async () => {
      const q = query(collection(db, 'stickers'), where('uid', '==', otherUser.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Sticker))
        .filter(sticker => ALBUM_ENTRY_MAP.has(getStickerCode(sticker)))
        .map(sticker => ({ ...sticker, code: getStickerCode(sticker) }));
      setTheirStickers(data);
      setLoading(false);
    };
    fetchStickers();
  }, [otherUser.uid]);

  const { iCanGive, theyCanGive } = useMemo(() => {
    const myDuplicates = currentUserStickers.filter(s => s.count > 1).map(getStickerCode);
    const theirOwnedSet = new Set(theirStickers.map(getStickerCode));
    const myOwnedSet = new Set(currentUserStickers.map(getStickerCode));
    const theirDuplicates = theirStickers.filter(s => s.count > 1).map(getStickerCode);
    return {
      iCanGive: myDuplicates.filter(n => !theirOwnedSet.has(n)).sort(compareStickerCodes),
      theyCanGive: theirDuplicates.filter(n => !myOwnedSet.has(n)).sort(compareStickerCodes),
    };
  }, [currentUserStickers, theirStickers]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Sugestão de troca</h3>
            <p className="text-white/50 text-sm mt-0.5">com {otherUser.displayName}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Mail size={14} />
            <span>Contato: </span>
            <a href={`mailto:${otherUser.email}`} className="text-football-green hover:underline font-medium">{otherUser.email}</a>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-white/40 text-sm">Calculando sugestões...</div>
        ) : (
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-football-green mb-3 flex items-center gap-1.5">
                <Plus size={12} /> Você pode oferecer ({iCanGive.length})
              </div>
              {iCanGive.length === 0 ? (
                <p className="text-white/30 text-xs">Nenhuma repetida que ele(a) precisa.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {iCanGive.map(n => (
                    <span key={n} className="bg-football-green/20 text-football-green text-[11px] font-bold px-2 py-0.5 rounded-md">{n}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gold mb-3 flex items-center gap-1.5">
                <Plus size={12} /> Você pode solicitar ({theyCanGive.length})
              </div>
              {theyCanGive.length === 0 ? (
                <p className="text-white/30 text-xs">Ele(a) não tem repetidas que você precisa.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {theyCanGive.map(n => (
                    <span key={n} className="bg-gold/20 text-gold text-[11px] font-bold px-2 py-0.5 rounded-md">{n}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AlfredoChat = ({ user, stickers, onUpdateBatch }: { user: User, stickers: Sticker[], onUpdateBatch: (codes: string[], mode?: 'add' | 'remove') => void }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Olá! Eu sou o Alfredo. Como posso te ajudar com seu álbum hoje? Você pode me mandar uma lista de códigos, ou me enviar uma foto das suas figurinhas!', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const quickActions = [
    { label: 'Status do Álbum', prompt: 'Qual o status do meu álbum?' },
    { label: 'O que falta?', prompt: 'Quais figurinhas faltam?' },
    { label: 'Limpar Chat', action: () => setMessages([{ role: 'assistant', content: 'Chat limpo! Como posso ajudar?', timestamp: Date.now() }]) },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const base64Data = base64.split(',')[1];
      
      setMessages(prev => [...prev, { 
        role: 'user', 
        content: 'Enviando foto para análise...', 
        timestamp: Date.now() 
      }]);

      await handleSend("Analise esta foto de figurinhas da Copa do Mundo 2026 e extraia os códigos das figurinhas que você encontrar.", base64Data, file.type);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (overrideInput?: string, imageData?: string, mimeType?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() && !imageData) return;

    if (!overrideInput) {
      const userMsg: Message = { role: 'user', content: textToSend, timestamp: Date.now() };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
    }
    
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const parts: any[] = [{ text: `
        You are Alfredo, a sticker album assistant for the 2026 World Cup.
        The user has ${stickers.length} unique stickers out of ${TOTAL_STICKERS}.
        Total stickers: ${stickers.reduce((acc, s) => acc + s.count, 0)}.
        
        Current stickers owned (codes): ${stickers.map(getStickerCode).join(', ')}.
        Valid sticker sections:
        - FWC-01 to FWC-19
        - CC-01 to CC-12
        - For each team code ${TEAM_GROUPS.flatMap(({ teams }) => teams).join(', ')}, use -01 to -20
        
        User message: "${textToSend}"
        
        If an image is provided, perform OCR to find sticker codes.
        If the user provides sticker codes to add, extract them.
        If the user asks to remove stickers, extract them.
        If the user asks for status, provide it.
        If the user provides a list of a friend's stickers, compare with their missing ones.
        Always normalize codes to the format SIGLA-NN.
        
        Return a JSON response with:
        {
          "reply": "Your friendly response in Portuguese",
          "action": "add" | "remove" | "status" | "match" | "none",
          "codes": [string] // stickers to add or remove or friend's stickers
        }
      ` }];

      if (imageData && mimeType) {
        parts.push({
          inlineData: {
            data: imageData,
            mimeType: mimeType
          }
        });
      }

      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              action: { type: Type.STRING },
              codes: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["reply", "action"]
          }
        }
      });

      const response = await model;
      const data = JSON.parse(response.text);

      if (data.action === 'add' && data.codes?.length > 0) {
        onUpdateBatch(data.codes.map(normalizeStickerCode), 'add');
      } else if (data.action === 'remove' && data.codes?.length > 0) {
        onUpdateBatch(data.codes.map(normalizeStickerCode), 'remove');
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply, 
        timestamp: Date.now() 
      }]);
    } catch (error) {
      console.error("Gemini error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ops, tive um probleminha para processar isso. Pode repetir?', timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-3xl overflow-hidden flex flex-col h-[600px] border border-white/10 shadow-2xl">
      <div className="bg-white/5 p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-football-green rounded-full flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold">Alfredo AI</div>
            <div className="text-[10px] text-football-green font-bold uppercase tracking-widest">Online</div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-dark-bg/40">
        {messages.map((msg, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
              msg.role === 'user' 
                ? 'bg-football-green text-white rounded-tr-none' 
                : 'bg-white/10 text-white border border-white/5 rounded-tl-none'
            }`}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <div className="text-[8px] opacity-40 mt-2 text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5 flex gap-1">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white/5 border-t border-white/10">
        <div className="flex flex-wrap gap-2 mb-4">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              onClick={() => qa.action ? qa.action() : handleSend(qa.prompt)}
              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-football-green/30 transition-all text-white/60 hover:text-white"
            >
              {qa.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="bg-white/5 hover:bg-white/10 text-white/60 p-3 rounded-xl transition-all border border-white/10"
            title="Enviar foto"
          >
            <Camera size={20} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Mande uma mensagem..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-football-green transition-colors"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="bg-football-green hover:bg-football-green/90 disabled:opacity-50 disabled:hover:bg-football-green text-white p-3 rounded-xl transition-all"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const RankingTab = ({ currentUser, currentUserStickers }: {
  currentUser: User;
  currentUserStickers: Sticker[];
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeTarget, setTradeTarget] = useState<UserProfile | null>(null);
  const isAdmin = currentUser.email === ADMIN_EMAIL;

  useEffect(() => {
    const fetchUsers = async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      const data = snapshot.docs
        .map(d => d.data() as UserProfile)
        .sort((a, b) => b.totalOwned - a.totalOwned);
      setUsers(data);
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const toggleHidden = async (u: UserProfile) => {
    const userRef = doc(db, 'users', u.uid);
    await updateDoc(userRef, { hidden: !u.hidden });
    setUsers(prev => prev.map(p => p.uid === u.uid ? { ...p, hidden: !p.hidden } : p));
    toast.success(u.hidden ? `${u.displayName} visível no ranking.` : `${u.displayName} ocultado do ranking.`);
  };

  const toggleBan = async (u: UserProfile) => {
    const action = u.banned ? 'desbanir' : 'banir';
    if (!window.confirm(`Deseja ${action} ${u.displayName} (${u.email})?`)) return;
    const userRef = doc(db, 'users', u.uid);
    await updateDoc(userRef, { banned: !u.banned });
    setUsers(prev => prev.map(p => p.uid === u.uid ? { ...p, banned: !p.banned } : p));
    toast.success(u.banned ? `${u.displayName} foi desbanido.` : `${u.displayName} foi banido.`);
  };

  if (loading) {
    return <div className="text-center py-16 text-white/40 text-sm">Carregando ranking...</div>;
  }

  const displayUsers = isAdmin ? users : users.filter(u => !u.hidden && !u.banned);

  if (displayUsers.length === 0) {
    return <div className="text-center py-16 text-white/40 text-sm">Nenhum participante ainda.</div>;
  }

  let rankPosition = 0;

  return (
    <>
      {isAdmin && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-xs font-bold">
          <ShieldAlert size={14} /> Modo Admin — você vê todos os usuários, incluindo ocultos e banidos.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-widest">
              <th className="text-left p-4 font-bold">#</th>
              <th className="text-left p-4 font-bold">Participante</th>
              <th className="text-center p-4 font-bold">Coladas</th>
              <th className="text-center p-4 font-bold">Faltam</th>
              <th className="text-center p-4 font-bold">Repetidas</th>
              <th className="text-center p-4 font-bold">Progresso</th>
              <th className="text-center p-4 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.map((u) => {
              const progress = ((u.totalOwned / TOTAL_STICKERS) * 100).toFixed(1);
              const missing = TOTAL_STICKERS - u.totalOwned;
              const isMe = u.uid === currentUser.uid;
              if (!u.hidden && !u.banned) rankPosition++;
              const pos = (!u.hidden && !u.banned) ? rankPosition : null;
              return (
                <tr key={u.uid} className={`border-b border-white/5 transition-colors
                  ${isMe ? 'bg-football-green/5' : ''}
                  ${u.banned ? 'opacity-40' : ''}
                  ${u.hidden && !u.banned ? 'opacity-60' : ''}
                  ${!isMe && !u.banned ? 'hover:bg-white/[0.02]' : ''}
                `}>
                  <td className="p-4 text-white/40 font-bold">
                    {pos === 1 ? <Trophy size={16} className="text-gold" /> : pos ?? '—'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {u.photoURL && <img src={u.photoURL} className="w-7 h-7 rounded-full border border-white/10" referrerPolicy="no-referrer" alt="" />}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{u.displayName}</span>
                        {isMe && <span className="text-[10px] text-football-green font-bold uppercase tracking-widest">você</span>}
                        {isAdmin && u.hidden && <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-0.5"><EyeOff size={10} /> oculto</span>}
                        {isAdmin && u.banned && <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-0.5"><UserX size={10} /> banido</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center font-bold">{u.totalOwned}</td>
                  <td className="p-4 text-center text-red-400 font-bold">{missing}</td>
                  <td className="p-4 text-center text-gold font-bold">{u.totalDuplicates}</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-football-green rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-football-green font-bold text-xs w-12">{progress}%</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {!isMe && !u.banned && (
                        <button
                          onClick={() => setTradeTarget(u)}
                          className="bg-white/5 hover:bg-football-green/20 border border-white/10 hover:border-football-green/40 text-white/60 hover:text-football-green text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
                        >
                          Sugerir troca
                        </button>
                      )}
                      {isAdmin && !isMe && (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => toggleHidden(u)}
                            title={u.hidden ? 'Mostrar no ranking' : 'Ocultar do ranking'}
                            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                          >
                            {u.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button
                            onClick={() => toggleBan(u)}
                            title={u.banned ? 'Desbanir usuário' : 'Banir usuário'}
                            className={`p-1.5 rounded-lg transition-all ${u.banned ? 'text-green-400 hover:bg-green-400/10' : 'text-white/30 hover:text-red-400 hover:bg-red-400/10'}`}
                          >
                            {u.banned ? <UserCheck size={14} /> : <UserX size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tradeTarget && (
        <TradeModal
          currentUserStickers={currentUserStickers}
          otherUser={tradeTarget}
          onClose={() => setTradeTarget(null)}
        />
      )}
    </>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<'home' | 'ranking'>(
    () => window.location.hash === '#ranking' ? 'ranking' : 'home'
  );

  const handleNavigate = (page: 'home' | 'ranking') => {
    window.location.hash = page === 'ranking' ? 'ranking' : '';
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onHashChange = () => {
      const page = window.location.hash === '#ranking' ? 'ranking' : 'home';
      setActivePage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().banned) {
          await signOut(auth);
          setError('Sua conta foi banida desta plataforma.');
          setIsAuthReady(true);
          return;
        }
      }
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setStickers([]);
      return;
    }

    const path = 'stickers';
    const q = query(collection(db, path), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Sticker))
        .filter(sticker => {
          const code = getStickerCode(sticker);
          return Boolean(code) && ALBUM_ENTRY_MAP.has(code);
        })
        .map(sticker => ({ ...sticker, code: getStickerCode(sticker) }));
      setStickers(data.sort((a, b) => compareStickerCodes(getStickerCode(a), getStickerCode(b))));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      setError(err.message);
    });

    return () => unsubscribe();
  }, [user]);

  // Create or update user profile document on login
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const displayName = user.displayName?.split(' ')[0] || 'Colecionador';
    getDoc(userRef).then(snap => {
      if (!snap.exists()) {
        setDoc(userRef, {
          uid: user.uid,
          email: user.email || '',
          displayName,
          photoURL: user.photoURL || null,
          totalOwned: 0,
          totalDuplicates: 0,
        });
      } else {
        updateDoc(userRef, {
          email: user.email || '',
          displayName,
          photoURL: user.photoURL || null,
        });
      }
    });
  }, [user?.uid]);

  // Sync sticker stats to user profile
  useEffect(() => {
    if (!user) return;
    const totalOwned = stickers.length;
    const totalDuplicates = stickers.reduce((acc, s) => acc + (s.count > 1 ? s.count - 1 : 0), 0);
    const userRef = doc(db, 'users', user.uid);
    updateDoc(userRef, { totalOwned, totalDuplicates }).catch(() => {});
  }, [user?.uid, stickers]);

  const updateSticker = async (code: string, delta: number) => {
    if (!user) return;
    const normalizedCode = normalizeStickerCode(code);
    if (!ALBUM_ENTRY_MAP.has(normalizedCode)) return;
    const stickerId = `${user.uid}_${normalizedCode}`;
    const path = `stickers/${stickerId}`;
    const stickerRef = doc(db, 'stickers', stickerId);
    
    try {
      const snap = await getDoc(stickerRef);
      if (snap.exists()) {
        const currentCount = snap.data().count;
        const newCount = Math.max(0, currentCount + delta);
        if (newCount === 0) {
          await deleteDoc(stickerRef);
          toast.success(`Figurinha ${normalizedCode} removida!`);
        } else {
          await updateDoc(stickerRef, { count: newCount, updatedAt: serverTimestamp() });
          toast.success(`Figurinha ${normalizedCode} atualizada (${newCount})!`);
        }
      } else if (delta > 0) {
        await setDoc(stickerRef, {
          uid: user.uid,
          code: normalizedCode,
          count: delta,
          updatedAt: serverTimestamp()
        });
        toast.success(`Figurinha ${normalizedCode} adicionada!`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateBatch = async (codes: string[], mode: 'add' | 'remove' = 'add') => {
    if (!user) return;
    const batch = writeBatch(db);
    const normalizedCodes = [...new Set(codes.map(normalizeStickerCode))].filter(code => ALBUM_ENTRY_MAP.has(code));
    if (normalizedCodes.length === 0) {
      toast.error('Nenhum código de figurinha válido foi encontrado.');
      return;
    }
    
    try {
      for (const code of normalizedCodes) {
        const stickerId = `${user.uid}_${code}`;
        const stickerRef = doc(db, 'stickers', stickerId);
        const snap = await getDoc(stickerRef);
        
        if (mode === 'add') {
          if (snap.exists()) {
            batch.update(stickerRef, { count: snap.data().count + 1, updatedAt: serverTimestamp() });
          } else {
            batch.set(stickerRef, {
              uid: user.uid,
              code,
              count: 1,
              updatedAt: serverTimestamp()
            });
          }
        } else {
          if (snap.exists()) {
            const currentCount = snap.data().count;
            if (currentCount <= 1) {
              batch.delete(stickerRef);
            } else {
              batch.update(stickerRef, { count: currentCount - 1, updatedAt: serverTimestamp() });
            }
          }
        }
      }
      await batch.commit();
      toast.success(`${normalizedCodes.length} figurinhas ${mode === 'add' ? 'adicionadas' : 'removidas'} com sucesso!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'stickers/batch');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stats = useMemo(() => {
    const owned = stickers.length;
    const duplicates = stickers.reduce((acc, s) => acc + (s.count > 1 ? s.count - 1 : 0), 0);
    const missing = TOTAL_STICKERS - owned;
    const progress = ((owned / TOTAL_STICKERS) * 100).toFixed(2);
    return { owned, duplicates, missing, progress };
  }, [stickers]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-football-green rounded-2xl flex items-center justify-center animate-pulse">
            <Bot className="text-white" size={32} />
          </div>
          <div className="text-white/40 text-xs font-bold uppercase tracking-widest">Carregando Alfredo...</div>
        </div>
      </div>
    );
  }

  const handleHeroLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      console.error("Hero login failed:", error);
      setError(error.message || String(error));
    }
  };

  return (
    <div className="min-h-screen selection:bg-football-green/30">
      <Navbar user={user} onError={setError} activePage={activePage} onNavigate={handleNavigate} />
      <ErrorBoundary error={error} />
      <Toaster position="top-center" richColors theme="dark" />

      {/* 1. HERO */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-football-green/10 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8"
          >
            <span className="w-2 h-2 bg-football-green rounded-full animate-pulse"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">Seu assistente de figurinhas</span>
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-[1.1]">
            Controle seu álbum da Copa <br className="hidden md:block" />
            <span className="text-football-green">sem planilha, sem papel.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Mande foto, informe os códigos ou digite: o Alfredo registra, organiza e te diz exatamente o que trocar.
          </p>

          {!user && (
            <button 
              onClick={handleHeroLogin}
              className="bg-whatsapp-green hover:bg-whatsapp-green/90 text-dark-bg font-black py-5 px-12 rounded-2xl text-lg transition-all shadow-xl shadow-whatsapp-green/20 flex items-center gap-3 mx-auto group"
            >
              Começar Agora <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>
      </section>

      {user ? (
        <>
          {/* STATS BAR */}
          <div className="sticky top-[72px] z-40 bg-dark-bg/80 backdrop-blur-md border-y border-white/10 py-4 px-6">
            <div className="max-w-7xl mx-auto space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center md:border-r border-white/10">
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Progresso</div>
                  <div className="text-xl font-black text-football-green">{stats.progress}%</div>
                </div>
                <div className="text-center md:border-r border-white/10">
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Coladas</div>
                  <div className="text-xl font-black">{stats.owned} / {TOTAL_STICKERS}</div>
                </div>
                <div className="text-center md:border-r border-white/10">
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Faltam</div>
                  <div className="text-xl font-black text-red-400">{stats.missing}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Repetidas</div>
                  <div className="text-xl font-black text-gold">{stats.duplicates}</div>
                </div>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-football-green shadow-[0_0_10px_rgba(22,163,74,0.5)]"
                />
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activePage === 'ranking' ? (
              <motion.div
                key="ranking"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.3 }}
                className="min-h-screen py-16 px-6"
              >
                <div className="max-w-7xl mx-auto">
                  <div className="mb-8 flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold flex items-center gap-3">
                        <Trophy className="text-gold" size={28} /> Ranking
                      </h2>
                      <p className="text-white/60 text-sm mt-1">Progresso de todos os participantes.</p>
                    </div>
                    <button
                      onClick={() => handleNavigate('home')}
                      className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors border border-white/10 hover:border-white/30 px-4 py-2 rounded-xl"
                    >
                      ← Voltar
                    </button>
                  </div>
                  <RankingTab currentUser={user} currentUserStickers={stickers} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                {/* CHAT SECTION */}
                <SectionWrapper id="chat">
                  <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                      <h2 className="text-3xl font-bold mb-2">Fale com o Alfredo</h2>
                      <p className="text-white/60 text-sm">Mande códigos, fotos ou pergunte o que trocar.</p>
                    </div>
                    <AlfredoChat user={user} stickers={stickers} onUpdateBatch={updateBatch} />
                  </div>
                </SectionWrapper>

                {/* ALBUM SECTION */}
                <SectionWrapper id="album" className="bg-white/[0.02]">
                  <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-12">
                      <h2 className="text-3xl font-bold">Meu Álbum</h2>
                      <div className="flex items-center gap-6">
                        <button
                          onClick={() => handleNavigate('ranking')}
                          className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-football-green transition-colors uppercase tracking-widest"
                        >
                          <Trophy size={14} /> Ver Ranking
                        </button>
                        <div className="text-xs font-bold text-white/30 uppercase tracking-widest hidden sm:block">Clique para adicionar · Botão direito para remover</div>
                      </div>
                    </div>
                    <StickerGrid stickers={stickers} onUpdate={updateSticker} />
                  </div>
                </SectionWrapper>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : null}

      {/* FOOTER */}
      <footer className="py-12 px-6 border-t border-white/5 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 bg-football-green rounded-lg flex items-center justify-center">
            <Bot className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Alfredo</span>
        </div>
        <p className="text-white/30 text-sm">© 2026 Alfredo - Seu assistente de figurinhas. Todos os direitos reservados.</p>
        <p className="text-white/20 text-[10px] mt-2 uppercase tracking-widest">Feito com ❤️ para torcedores</p>
      </footer>
    </div>
  );
}
