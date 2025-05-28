export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  timestamp: number;
  isAdmin?: boolean;
  isSystem?: boolean;
  isEscrowRequest?: boolean;
  isRequest?: boolean;
  isPaymentConfirmation?: boolean;
  transactionData?: {
    productName: string;
    price: number;
    paymentMethod: string;
    transactionId: string;
    useEscrow: boolean;
  };
}

export interface Chat {
  id: string;
  participants: string[];
  participantNames?: Record<string, string>;
  participantPhotos?: Record<string, string | null>;
  name?: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: {
    text: string;
    timestamp: number;
    senderId: string;
  };
  sellerId?: string;
  buyerId?: string;
  productId?: string;
  productName?: string;
  paymentSessionId?: string;
  paymentStatus?: string;
  paymentCompleted?: boolean;
  paymentCompletedAt?: number;
  feeAmount?: number;
  totalAmount?: number;
  productPrice?: number;
  sellerConfirmed?: boolean;
  sellerConfirmedAt?: number;
  adminJoined?: boolean;
  adminJoinedAt?: number;
  adminId?: string;
  adminPhotoURL?: string;
  isPrivateWithAdmin?: boolean;
  originalChatId?: string;
  hasPrivateAdminChat?: boolean;
  privateAdminChatId?: string;
  privateAdminChatCreatedAt?: number;
  escrowAgentAdminId?: string;
  escrowAgentAdminEmail?: string;
  escrowAgentAssignedAt?: number;
  managerRightsAssigned?: boolean;
  
  // ტაიმერის ველები
  transferTimerStarted?: boolean;
  transferTimerStartedAt?: number;
  transferReadyTime?: number;
  transferStatus?: string;
  timerActive?: boolean;
  timerEndDate?: number;
  
  // ახალი ველები პირველადი მფლობელობის გადაცემისთვის
  status?: string;
  transferReady?: boolean;
  primaryTransferInitiated?: boolean;
  primaryTransferInitiatedAt?: number;
  primaryOwnerConfirmed?: boolean;
  primaryOwnerConfirmedAt?: number;
  paymentConfirmedByBuyer?: boolean;
  paymentConfirmedByBuyerAt?: number;
  closedAt?: number;
  closedBy?: string;
  escrowActive?: boolean;
  owners?: string[];
  
  // დამატებული ახალი ველები ლინტერის შეცდომების გამოსასწორებლად
  buyerConfirmedPayment?: boolean;
  sellerConfirmedReceipt?: boolean;
  completedAt?: number;
}

export interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
} 