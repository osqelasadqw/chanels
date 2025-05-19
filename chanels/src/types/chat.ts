export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  timestamp: number;
  isAdmin?: boolean;
  isRequest?: boolean;
  isSystem?: boolean;
  isEscrowRequest?: boolean;
  isPaymentConfirmation?: boolean;
  transactionData?: {
    productId: string;
    productName: string;
    price: number;
    useEscrow: boolean;
    paymentMethod: string;
    transactionId: number;
  };
}

export interface Chat {
  id: string;
  productId: string;
  productName?: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string>;
  lastMessage?: Message;
  createdAt: number;
  adminJoined?: boolean;
  hiddenBy?: string[];
  isPrivateWithAdmin?: boolean;
  isPrivateWithUser?: boolean;
  isEscrowChat?: boolean;
  originalChatId?: string;
  paymentCompleted?: boolean;
  paymentCompletedAt?: number;
  paymentStatus?: string;
  paymentId?: string;
  paymentSessionId?: string;
  feeAmount?: number;
}

export interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
} 