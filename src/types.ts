export type MessageRole = 'user' | 'assistant';

export interface GroundingSource {
  title?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  groundingSources?: GroundingSource[];
  imageUrl?: string;
  mediaType?: 'image' | 'video';
  generatedImageUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  isGeneratingMedia?: boolean;
  mediaProgressLabel?: string;
}

export type ChatTone = 'default' | 'research' | 'concise' | 'creative' | 'gaming';

export interface UserProfile {
  name: string;
  role: string;
  avatarColor: string;
  customAvatar?: string;
  customInstructions?: string;
  email?: string;
  credits?: number;
  lastClaimedTransferId?: string;
}

export interface CreditTransferRecord {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
  note?: string;
  status: 'pending' | 'claimed';
  createdAt: number;
  claimedAt?: number;
}

export type AppView =
  | 'chat'
  | 'home'
  | 'guides'
  | 'about'
  | 'privacy'
  | 'terms';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  tone: ChatTone;
}

export interface QuickPrompt {
  label: string;
  prompt: string;
  category: 'agent' | 'image' | 'video' | 'code';
  mode?: 'chat' | 'image' | 'video';
}

export interface VoiceOption {
  id: string;
  name: string;
  style: string;
  gender: 'female' | 'male' | 'neutral';
  referenceId: string;
  languages?: string[];
}

export type GlitchVoiceId = string;

export interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  createdAt: number;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  style?: string;
  isEdited?: boolean;
  watermark?: boolean;
  resolution?: string;
}

export interface GeneratedVideo {
  id: string;
  prompt: string;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: number;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  resolution: string;
}
