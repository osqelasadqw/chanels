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
  sellerConfirmed?: boolean;
  sellerConfirmedAt?: number;
  transferTimerStarted?: boolean;
  transferTimerStartedAt?: number;
  transferReadyTime?: number;
  transferStatus?: 'pending' | 'completed' | 'cancelled';
  sellerId?: string;
  adminId?: string;
  adminPhotoURL?: string;
  hasPrivateAdminChat?: boolean;
  privateAdminChatId?: string;
  privateAdminChatCreatedAt?: number;
  totalAmount?: number;
  productPrice?: number;
  timerActive?: boolean;
  timerStartDate?: number;
  timerEndDate?: number;
  managerRightsAssigned?: boolean;
}

export interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
} 