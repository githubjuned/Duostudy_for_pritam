import { Timestamp } from 'firebase/firestore';

export type SessionMode = 'study' | 'break';

export interface User {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: Timestamp;
  nudgeCount?: number;
  sessionsCompleted?: number;
  completedDays?: string[];
  totalScore?: number;
  mood?: string;
  weeklySessions?: number;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  timestamp: Timestamp;
}

export interface Challenge {
  id: string;
  title: string;
  description?: string;
  acceptedBy: string[];
  completedBy: string[];
  date: string; // yyyy-MM-dd
  streak?: number;
  timestamp?: Timestamp;
}

export interface Session {
  timeLeft: number;
  isRunning: boolean;
  mode: SessionMode;
  lastUpdated: Timestamp;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
}
