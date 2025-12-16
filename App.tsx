import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Zap, Loader2, Volume2 } from 'lucide-react';
import { createPcmBlob, getRandomColor } from './utils/audio';
import { ConnectionState, GameState, Particle } from './types';
import BoVisualizer from './components/BoVisualizer';

// Detect specifically "bó" or variants
const BO_REGEX = /\b(bó|bo|bow|ball|boy|bough|paul|bof)\b/gi;

const App: React.FC = () => {
  // Game State
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    combo: 1,
    maxCombo: 1,
    lastBoTime: 0,
  });
  
  // Connection State
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Particles for Visuals
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdCounter = useRef(0);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Logic to trigger a "Bó" explosion
  const triggerBo = useCallback((count: number) => {
    const now = Date.now();
    
    setGameState(prev => {
      // Combo logic: if last bo was less than 2 seconds ago, increment combo
      const isCombo = now - prev.lastBoTime < 2000;
      const newCombo = isCombo ? prev.combo + count : 1;
      const points = count * 100 * newCombo;
      
      return {
        score: prev.score + points,
        combo: newCombo,
        maxCombo: Math.max(prev.maxCombo, newCombo),
        lastBoTime: now,
      };
    });

    // Create explosion
    for (let i = 0; i < count; i++) {
        // Spawn multiple particles per "bo" for effect
        const particleCount = 5 + (Math.min(gameState.combo, 10)); 
        
        for(let j=0; j<particleCount; j++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = 5 + Math.random() * 10;
            const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 100;
            const startY = window.innerHeight / 2 + (Math.random() - 0.5) * 100;

            const newParticle: Particle = {
                id: particleIdCounter.current++,
                x: startX,
                y: startY,
                text: 'BÓ',
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity - 5, // Initial Upward burst
                rotation: Math.random() * 360,
                vRotation: (Math.random() - 0.5) * 20,
                scale: 2 + Math.random() * 3, // Big text
                color: getRandomColor(),
                life: 1.0,
                decay: 0.01 + Math.random() * 0.02
            };
            
            setParticles(prev => [...prev, newParticle]);
        }
    }
  }, [gameState.combo]);

  // Handle Gemini Connection
  const connectToGemini = async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setErrorMessage('');

      // 1. Setup Audio Input
      // We do not force sampleRate here as some devices fail. We handle resampling manually.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
      }});
      mediaStreamRef.current = stream;

      // Initialize AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      
      // Critical: Ensure context is running (sometimes it starts suspended)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      audioContextRef.current = audioContext;
      const contextSampleRate = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      // Buffer size 4096 gives decent latency/performance balance
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      // 2. Setup Gemini Live Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          // Correct configuration for transcription is an empty object to just enable it.
          // Specifying a model name here often causes validation errors.
          inputAudioTranscription: {},
          systemInstruction: `
            You are a minimalist 'Bó' detector.
            Your ONLY task is to listen to the user.
            We are playing a game where 'Bó' is the magic word.
            If the user says 'bó', 'bo', or 'bow', acknowledge it. 
            Do not speak long sentences. 
            You can occasionally say 'Bó!' back enthusiastically in Portuguese.
          `,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          }
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Connected");
            setConnectionState(ConnectionState.CONNECTED);
          },
          onmessage: (message: LiveServerMessage) => {
            // Check transcription for the keyword
            const transcription = message.serverContent?.inputTranscription?.text;
            if (transcription) {
              console.log("Transcription:", transcription);
              const matches = transcription.match(BO_REGEX);
              if (matches && matches.length > 0) {
                triggerBo(matches.length);
              }
            }
          },
          onclose: (e) => {
            console.log("Gemini Closed", e);
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            console.error("Gemini Error:", err);
            setConnectionState(ConnectionState.ERROR);
            setErrorMessage('Connection failed. Please check API Key or reload.');
            cleanupAudio();
          }
        }
      });

      // 3. Stream Audio Data
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Important: Pass the actual context sample rate so we can downsample if needed
        const pcmBlob = createPcmBlob(inputData, contextSampleRate);
        
        sessionPromise.then(session => {
           session.sendRealtimeInput({ media: pcmBlob });
        }).catch(err => {
            // Check if connection is actually closed before logging spam
            if (connectionState === ConnectionState.CONNECTED) {
                 console.error("Session send error", err);
            }
        });
      };

    } catch (error) {
      console.error("Setup failed", error);
      setConnectionState(ConnectionState.ERROR);
      setErrorMessage("Microphone access denied or API error.");
    }
  };

  const cleanupAudio = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const disconnect = () => {
    cleanupAudio();
    setConnectionState(ConnectionState.DISCONNECTED);
    window.location.reload(); 
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden flex flex-col items-center justify-center font-sans">
      
      {/* Visual Layer */}
      <BoVisualizer particles={particles} setParticles={setParticles} />

      {/* Persistent UI Layer */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
        
        {/* Score Board */}
        <div className="flex flex-col items-start gap-2">
            <div className="bg-white/90 backdrop-blur shadow-lg rounded-2xl p-4 border border-gray-100 pointer-events-auto transition-transform hover:scale-105">
                <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">Pontuação</div>
                <div className="text-5xl font-black text-gray-800 tabular-nums">
                    {gameState.score.toLocaleString()}
                </div>
            </div>

            {gameState.combo > 1 && (
                <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-xl rounded-2xl p-3 px-6 animate-bounce">
                    <div className="text-3xl font-black italic">
                        {gameState.combo}x COMBO!
                    </div>
                </div>
            )}
        </div>

        {/* Controls */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
            {connectionState === ConnectionState.DISCONNECTED && (
                 <button
                 onClick={connectToGemini}
                 className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-full font-bold text-lg shadow-xl hover:bg-gray-800 transition-all hover:scale-105 active:scale-95"
               >
                 <Mic className="w-6 h-6 group-hover:animate-pulse" />
                 <span>Começar Bó</span>
                 <span className="absolute -bottom-2 right-4 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Microfone necessário
                 </span>
               </button>
            )}

            {connectionState === ConnectionState.CONNECTING && (
                <div className="flex items-center gap-3 px-6 py-3 bg-gray-100 text-gray-600 rounded-full font-semibold shadow-inner">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Conectando...</span>
                </div>
            )}

            {connectionState === ConnectionState.CONNECTED && (
                 <button
                 onClick={disconnect}
                 className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 border-2 border-red-100 rounded-full font-bold hover:bg-red-100 transition-colors"
               >
                 <MicOff className="w-5 h-5" />
                 <span>Parar</span>
                 <span className="flex h-3 w-3 relative ml-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                 </span>
               </button>
            )}
            
            {connectionState === ConnectionState.ERROR && (
                 <div className="text-red-500 text-sm font-semibold max-w-xs text-right">
                    {errorMessage}
                 </div>
            )}
        </div>
      </div>

      {/* Hero / Instructions (Only visible when score is 0 and disconnected) */}
      {connectionState === ConnectionState.DISCONNECTED && gameState.score === 0 && (
          <div className="text-center z-40 max-w-lg p-6 animate-fade-in-up">
              <h1 className="text-6xl font-black text-gray-900 mb-6 tracking-tight">
                  Projeto <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-yellow-500">Bó</span>
              </h1>
              <p className="text-xl text-gray-500 mb-8 leading-relaxed">
                  Conecte seu microfone e fale <strong>"Bó"</strong> para explodir a tela.
                  <br/>
                  <span className="text-sm opacity-75">Tente combos como "Bó bó bó!"</span>
              </p>
          </div>
      )}

      {/* Visual Feedback Indicator */}
      {connectionState === ConnectionState.CONNECTED && (
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 z-40 opacity-50">
           <Volume2 className="w-8 h-8 text-gray-300 animate-pulse" />
           <p className="text-xs text-gray-300 font-medium uppercase tracking-widest">Ouvindo "Bó"...</p>
        </div>
      )}

    </div>
  );
};

export default App;