export interface Particle {
  id: number;
  x: number;
  y: number;
  text: string;
  vx: number;
  vy: number;
  rotation: number;
  vRotation: number;
  scale: number;
  color: string;
  life: number; // 0 to 1
  decay: number;
}

export interface GameState {
  score: number;
  combo: number;
  maxCombo: number;
  lastBoTime: number;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}
