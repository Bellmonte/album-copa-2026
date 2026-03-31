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
  Info
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
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';

// Gemini
import { GoogleGenAI, Type } from "@google/genai";

const TOTAL_STICKERS = 980;

// --- Types ---

interface Sticker {
  id: string;
  number: number;
  count: number;
  updatedAt: Timestamp;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

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

const Navbar = ({ user, onError }: { user: User | null, onError: (err: string) => void }) => {
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

  const navLinks = [
    { name: 'Meu Álbum', href: '#album' },
    { name: 'Alfredo Chat', href: '#chat' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-dark-bg/90 backdrop-blur-md border-b border-white/10 py-3' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-football-green rounded-xl flex items-center justify-center shadow-lg shadow-football-green/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Alfredo</span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a key={link.name} href={link.href} className="text-sm font-medium text-white/70 hover:text-football-green transition-colors">
              {link.name}
            </a>
          ))}
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
              {navLinks.map((link) => (
                <a 
                  key={link.name} 
                  href={link.href} 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-white/70"
                >
                  {link.name}
                </a>
              ))}
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

const StickerGrid = ({ stickers, onUpdate }: { stickers: Sticker[], onUpdate: (num: number, delta: number) => void }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing' | 'duplicates'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stickerMap = useMemo(() => {
    const map = new Map<number, Sticker>();
    stickers.forEach(s => map.set(s.number, s));
    return map;
  }, [stickers]);

  const filteredNumbers = useMemo(() => {
    const nums = Array.from({ length: TOTAL_STICKERS }, (_, i) => i + 1);
    return nums.filter(n => {
      const s = stickerMap.get(n);
      const matchesSearch = searchQuery === '' || n.toString().includes(searchQuery);
      if (!matchesSearch) return false;

      if (filter === 'owned') return s && s.count > 0;
      if (filter === 'missing') return !s || s.count === 0;
      if (filter === 'duplicates') return s && s.count > 1;
      return true;
    });
  }, [stickerMap, filter, searchQuery]);

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
              placeholder="Buscar número..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-10 py-2 text-xs focus:outline-none focus:border-football-green w-32 sm:w-48 transition-all"
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

      {filteredNumbers.length === 0 ? (
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
        <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-20 lg:grid-cols-25 gap-1">
          {filteredNumbers.map(n => {
            const s = stickerMap.get(n);
            const count = s?.count || 0;
            return (
              <button
                key={n}
                onClick={() => onUpdate(n, 1)}
                onContextMenu={(e) => { e.preventDefault(); onUpdate(n, -1); }}
                className={`aspect-square flex items-center justify-center text-[10px] font-bold rounded-sm transition-all relative group
                  ${count > 0 ? 'bg-football-green text-white' : 'bg-white/5 text-white/20 hover:bg-white/10'}
                  ${count > 1 ? 'ring-1 ring-gold' : ''}
                `}
              >
                {n}
                {count > 1 && (
                  <span className="absolute -top-1 -right-1 bg-gold text-dark-bg text-[9px] w-2.5 h-2.5 rounded-full flex items-center justify-center">
                    {count - 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNumbers.map(n => {
            const s = stickerMap.get(n);
            const count = s?.count || 0;
            return (
              <div key={n} className="glass-card p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${count > 0 ? 'bg-football-green text-white' : 'bg-white/5 text-white/20'}`}>
                    {n}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{count > 0 ? 'Adquirida' : 'Faltando'}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">{count > 1 ? `${count - 1} repetida(s)` : 'Nenhuma repetida'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onUpdate(n, -1)} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-red-400 transition-colors"><Minus size={16} /></button>
                  <span className="w-4 text-center text-sm font-bold">{count}</span>
                  <button onClick={() => onUpdate(n, 1)} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-football-green transition-colors"><Plus size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AlfredoChat = ({ user, stickers, onUpdateBatch }: { user: User, stickers: Sticker[], onUpdateBatch: (nums: number[], mode?: 'add' | 'remove') => void }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Olá! Eu sou o Alfredo. Como posso te ajudar com seu álbum hoje? Você pode me mandar uma lista de números, ou me enviar uma foto das suas figurinhas!', timestamp: Date.now() }
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

      await handleSend("Analise esta foto de figurinhas da Copa do Mundo 2026 e extraia os números que você encontrar.", base64Data, file.type);
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
        
        Current stickers owned (numbers): ${stickers.map(s => s.number).join(', ')}.
        
        User message: "${textToSend}"
        
        If an image is provided, perform OCR to find sticker numbers.
        If the user provides sticker numbers to add, extract them.
        If the user asks to remove stickers, extract them.
        If the user asks for status, provide it.
        If the user provides a list of a friend's stickers, compare with their missing ones.
        
        Return a JSON response with:
        {
          "reply": "Your friendly response in Portuguese",
          "action": "add" | "remove" | "status" | "match" | "none",
          "numbers": [number] // stickers to add or remove or friend's stickers
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
              numbers: { type: Type.ARRAY, items: { type: Type.INTEGER } }
            },
            required: ["reply", "action"]
          }
        }
      });

      const response = await model;
      const data = JSON.parse(response.text);

      if (data.action === 'add' && data.numbers?.length > 0) {
        onUpdateBatch(data.numbers, 'add');
      } else if (data.action === 'remove' && data.numbers?.length > 0) {
        onUpdateBatch(data.numbers, 'remove');
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sticker));
      setStickers(data.sort((a, b) => a.number - b.number));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      setError(err.message);
    });

    return () => unsubscribe();
  }, [user]);

  const updateSticker = async (number: number, delta: number) => {
    if (!user) return;
    const stickerId = `${user.uid}_${number}`;
    const path = `stickers/${stickerId}`;
    const stickerRef = doc(db, 'stickers', stickerId);
    
    try {
      const snap = await getDoc(stickerRef);
      if (snap.exists()) {
        const currentCount = snap.data().count;
        const newCount = Math.max(0, currentCount + delta);
        if (newCount === 0) {
          await deleteDoc(stickerRef);
          toast.success(`Figurinha ${number} removida!`);
        } else {
          await updateDoc(stickerRef, { count: newCount, updatedAt: serverTimestamp() });
          toast.success(`Figurinha ${number} atualizada (${newCount})!`);
        }
      } else if (delta > 0) {
        await setDoc(stickerRef, {
          uid: user.uid,
          number,
          count: delta,
          updatedAt: serverTimestamp()
        });
        toast.success(`Figurinha ${number} adicionada!`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateBatch = async (numbers: number[], mode: 'add' | 'remove' = 'add') => {
    if (!user) return;
    const batch = writeBatch(db);
    
    try {
      for (const num of numbers) {
        const stickerId = `${user.uid}_${num}`;
        const stickerRef = doc(db, 'stickers', stickerId);
        const snap = await getDoc(stickerRef);
        
        if (mode === 'add') {
          if (snap.exists()) {
            batch.update(stickerRef, { count: snap.data().count + 1, updatedAt: serverTimestamp() });
          } else {
            batch.set(stickerRef, {
              uid: user.uid,
              number: num,
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
      toast.success(`${numbers.length} figurinhas ${mode === 'add' ? 'adicionadas' : 'removidas'} com sucesso!`);
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
      <Navbar user={user} onError={setError} />
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
            Mande foto, fale os números ou digite — o Alfredo registra, organiza e te diz exatamente o que trocar.
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

          {/* CHAT SECTION */}
          <SectionWrapper id="chat">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold mb-2">Fale com o Alfredo</h2>
                <p className="text-white/60 text-sm">Mande números, fotos ou pergunte o que trocar.</p>
              </div>
              <AlfredoChat user={user} stickers={stickers} onUpdateBatch={updateBatch} />
            </div>
          </SectionWrapper>

          {/* ALBUM SECTION */}
          <SectionWrapper id="album" className="bg-white/[0.02]">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <h2 className="text-3xl font-bold">Meu Álbum</h2>
                <div className="text-xs font-bold text-white/30 uppercase tracking-widest">Clique para adicionar · Botão direito para remover</div>
              </div>
              <StickerGrid stickers={stickers} onUpdate={updateSticker} />
            </div>
          </SectionWrapper>
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
