"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ref, onValue, off, remove, set, push } from "firebase/database";
import { doc, getDoc, updateDoc, collection, addDoc, query, where, onSnapshot, orderBy, getDocs, deleteDoc } from "firebase/firestore";
import { db, rtdb } from "@/firebase/config";
import Image from "next/image";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase/config";

// Custom animation styles
const subtleAnimationStyles = `
  @keyframes subtlePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  
  @keyframes subtlePing {
    0% { transform: scale(1); opacity: 1; }
    75%, 100% { transform: scale(1.5); opacity: 0; }
  }
  
  .animate-subtle-pulse {
    animation: subtlePulse 3s ease-in-out infinite;
  }
  
  .animate-subtle-ping {
    animation: subtlePing 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
`;

// გაერთიანებული ინტერფეისი ყველა ნოტიფიკაციისთვის
interface BaseNotification {
  id: string;
  chatId: string;
  productId: string;
  createdAt: number;
  read: boolean;
}

interface AdminRequest {
  id: string;
  chatId: string;
  productId: string;
  requestedBy: string;
  requestedByName: string;
  timestamp: number;
}

interface WalletNotification extends BaseNotification {
  type: 'wallet_added';
  productName: string;
  transactionId: number;
  buyerName: string;
  buyerId: string;
  sellerName: string;
  sellerId: string;
  paymentMethod: string;
  amount: number;
  walletAddress: string;
}

// გადახდის ჩანაწერის ინტერფეისი paid კოლექციიდან
interface PaidPayment {
  id: string;
  chatId: string;
  userId: string;
  productId: string;
  paymentSessionId: string;
  amount: number;
  status: string;
  paymentMethod: string;
  currency: string;
  createdAt: number;
  stripeSessionId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  chatName: string;
}

// გადახდის შეტყობინების ინტერფეისი
interface PaymentNotification {
  id: string;
  type: 'payment_completed';
  chatId: string;
  productId: string;
  productName: string;
  buyerId: string;
  buyerName: string; // დავამატოთ buyerName ველი
  paymentSessionId: string;
  paymentAmount: number;
  createdAt: number;
  read: boolean;
  priority: string;
  needsAction: boolean;
  status: string;
}

interface AdminChatListProps {
  userPhoto?: string;
  userName?: string;
  onOpenProductsModal: () => void;
  onOpenEscrowChats: () => void;
  profilePhotoUploader: ReactNode;
}

interface ChatTransferStatus {
  timerEnded?: boolean;
  primaryOwner?: boolean;
  transferInitiated?: boolean;
  transferCompleted?: boolean;
  buyerConfirmedPayment?: boolean; // დავამატოთ მყიდველის მიერ დადასტურებული გადახდის სტატუსი
  sellerConfirmedReceipt?: boolean; // დავამატოთ გამყიდველის მიერ თანხის მიღების დადასტურების სტატუსი
}

export default function AdminChatList({
  userPhoto,
  userName = "Administrator",
  onOpenProductsModal,
  onOpenEscrowChats,
  profilePhotoUploader
}: AdminChatListProps) {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [walletNotifications, setWalletNotifications] = useState<WalletNotification[]>([]);
  const [paymentNotifications, setPaymentNotifications] = useState<PaymentNotification[]>([]);
  const [paidPayments, setPaidPayments] = useState<PaidPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<WalletNotification | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [chatTimerStatus, setChatTimerStatus] = useState<Record<string, boolean>>({});
  const [chatTransferStatus, setChatTransferStatus] = useState<Record<string, ChatTransferStatus>>({}); // ახალი სტეიტი
  const { user } = useAuth();
  const router = useRouter();

  const handleOpenProductsModalEvent = () => {
    window.dispatchEvent(new CustomEvent('openProductsModal'));
  };

  const handleOpenEscrowChatsModalEvent = () => {
    window.dispatchEvent(new CustomEvent('openEscrowChatsModal'));
  };

  useEffect(() => {
    if (!user || !user.isAdmin) return;

    setLoading(true);
    setError(null);

    // Listen for admin requests
    const adminRequestsRef = ref(rtdb, "adminRequests");
    
    onValue(adminRequestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const requestsList = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...value as Omit<AdminRequest, 'id'>
        }));
        
        // Sort requests by timestamp, newest first
        requestsList.sort((a, b) => b.timestamp - a.timestamp);
        
        setRequests(requestsList);
      } else {
        setRequests([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching admin requests:", err);
      setError("Failed to load requests");
      setLoading(false);
    });

    // Listen for wallet notifications
    const walletNotificationsRef = collection(db, "admin_notifications");
    const walletNotificationsQuery = query(
      walletNotificationsRef,
      where("type", "==", "wallet_added")
    );

    const unsubscribeWalletNotifications = onSnapshot(
      walletNotificationsQuery,
      (snapshot) => {
        const notificationsList: WalletNotification[] = [];
        snapshot.forEach((doc) => {
          notificationsList.push({
            id: doc.id,
            ...doc.data()
          } as WalletNotification);
        });
        notificationsList.sort((a, b) => b.createdAt - a.createdAt);
        setWalletNotifications(notificationsList);
      },
      (error) => {
        console.error("Error fetching wallet notifications:", error);
      }
    );

    // მივიღოთ გადახდის ჩანაწერები paid კოლექციიდან
    const paidPaymentsRef = collection(db, "paid");
    const paidPaymentsQuery = query(
      paidPaymentsRef,
      orderBy("createdAt", "desc")
    );
    
    const unsubscribePaidPayments = onSnapshot(
      paidPaymentsQuery,
      async (snapshot) => {
        const paymentsList: PaidPayment[] = [];
        
        snapshot.forEach((doc) => {
          paymentsList.push({
            id: doc.id,
            ...doc.data()
          } as PaidPayment);
        });
        
        // დავააპდეითოთ ლოკალური პადპაიმენტს სტეიტი
        setPaidPayments(paymentsList);
      },
      (error) => {
        console.error("Error fetching paid payments:", error);
      }
    );
    
    // რეალური დროის ნოტიფიკაციების მოსმენა
    const adminNotificationsRef = ref(rtdb, "adminNotifications");
    
    onValue(adminNotificationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("New admin notification received:", data);
        // არ დაგვჭირდება ნოტიფიკაციების დამატებით განახლება, რადგან 
        // Firestore-ის onSnapshot ისედაც განაახლებს ავტომატურად
      }
    });

    return () => {
      off(adminRequestsRef);
      off(adminNotificationsRef);
      unsubscribeWalletNotifications();
      unsubscribePaidPayments();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !user.isAdmin) return;

    // ვითხოვთ მხოლოდ გადახდილი ჩატების მონაცემებს ტაიმერის სტატუსის შესამოწმებლად
    if (paidPayments.length > 0) {
      // შევქმნათ გადახდილი ჩატების ID-ების მასივი
      const chatIds = paidPayments.map(payment => payment.chatId);
      
      // თუ არ არის ჩატების ID-ები, გამოვიდეთ
      if (chatIds.length === 0) return;
      
      // შევქმნათ ყველა ჩატისთვის შემოწმების ფუნქცია
      const fetchChatTimerStatuses = async () => {
        try {
          const chatsCollection = collection(db, "chats");
          const chatsSnapshot = await getDocs(chatsCollection);
          
          const newChatTimerStatus: Record<string, boolean> = {};
          const newChatTransferStatus: Record<string, ChatTransferStatus> = {};
          
          chatsSnapshot.forEach((doc) => {
            const chatData = doc.data();
            const chatId = doc.id;
            
            // Timer status
            const timerActive = chatData.timerActive || chatData.transferTimerStarted || false;
            newChatTimerStatus[chatId] = timerActive;
            
            // Transfer status
            newChatTransferStatus[chatId] = {
              timerEnded: (chatData.transferReady === true),
              primaryOwner: (chatData.primaryOwnerConfirmed === true),
              transferInitiated: (chatData.primaryTransferInitiated === true),
              transferCompleted: (chatData.primaryOwnerConfirmed === true),
              buyerConfirmedPayment: (chatData.buyerConfirmedPayment === true), // დავამატოთ მყიდველის დადასტურების სტატუსი
              sellerConfirmedReceipt: (chatData.sellerConfirmedReceipt === true) // დავამატოთ გამყიდველის დადასტურების სტატუსი
            };
          });
          
          setChatTimerStatus(newChatTimerStatus);
          setChatTransferStatus(newChatTransferStatus);
          
        } catch (err) {
          console.error("Error fetching chat timer statuses:", err);
        }
      };
      
      // გამოვიძახოთ ფუნქცია თავდაპირველად
      fetchChatTimerStatuses();
      
      // შევქმნათ ინტერვალი, რომელიც ყოველ 30 წამში შეამოწმებს სტატუსებს
      const intervalId = setInterval(() => {
        console.log("🔄 სტატუსების ავტომატური განახლება...");
        fetchChatTimerStatuses();
      }, 30000); // 30 წამი
      
      // გავასუფთავოთ ინტერვალი როდესაც კომპონენტი აღარ არის მაუნთში
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [paidPayments, user]);

  const handleJoinChat = async (request: AdminRequest) => {
    if (!user || !user.isAdmin) return;

    try {
      setProcessing(request.id);

      // Get chat data to verify it exists
      const chatDocRef = doc(db, "chats", request.chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }

      // Update the chat to mark admin as joined
      await updateDoc(chatDocRef, {
        adminJoined: true,
        participants: [...chatDoc.data().participants, user.id],
        participantNames: {
          ...chatDoc.data().participantNames,
          [user.id]: user.name
        },
        participantPhotos: {
          ...chatDoc.data().participantPhotos,
          [user.id]: user.photoURL || ""
        }
      });

      // Send a system message to the chat
      const messagesRef = ref(rtdb, `messages/${request.chatId}`);
      const messageKey = Date.now().toString();
      const messageRef = ref(rtdb, `messages/${request.chatId}/${messageKey}`);
      
      await set(messageRef, {
        text: "The escrow agent has joined the chat.",
        senderId: "system",
        senderName: "System",
        timestamp: Date.now(),
        isSystem: true
      });

      // Remove the request
      await remove(ref(rtdb, `adminRequests/${request.id}`));

      // Log the chat we're navigating to
      console.log('Joining chat and navigating to:', request.chatId);
      
      // შევინახოთ ჩატის ID ლოკალურად
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastChatId', request.chatId);
      }
      
      // გამოვიყენოთ query პარამეტრი, Next.js-ის სტანდარტული მიდგომა
      router.push(`/my-chats?chatId=${request.chatId}`);
    } catch (err) {
      console.error("Error joining chat:", err);
      setError("Failed to join chat");
      alert("Failed to join chat, please try again later");
    } finally {
      setProcessing(null);
    }
  };

  const handleShowDetails = (notification: WalletNotification) => {
    setSelectedNotification(notification);
    setShowDetailsModal(true);
  };

  const handleJoinChatFromNotification = async (notification: WalletNotification) => {
    if (!user || !user.isAdmin) return;

    try {
      setProcessing(notification.id);

      // Get chat data to verify it exists
      const chatDocRef = doc(db, "chats", notification.chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }

      // Check if admin is already part of the chat participants
      const chatData = chatDoc.data();
      
      if (!chatData.participants.includes(user.id)) {
        // Update the chat to add admin as a participant (ტაიმერის გარეშე)
        await updateDoc(chatDocRef, {
          adminJoined: true,
          participants: [...chatData.participants, user.id],
          participantNames: {
            ...chatData.participantNames,
            [user.id]: user.name
          },
          participantPhotos: {
            ...chatData.participantPhotos,
            [user.id]: user.photoURL || ""
          }
          // აღარ ვააქტიურებთ ტაიმერს ავტომატურად
        });
      }

      // Mark notification as read
      await updateDoc(doc(db, "admin_notifications", notification.id), {
        read: true
      });

      // Log the chat ID we're navigating to
      console.log('Navigating to chat from wallet notification:', notification.chatId);
      
      // შევინახოთ ჩატის ID ლოკალურად
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastChatId', notification.chatId);
      }
      
      // გამოვიყენოთ query პარამეტრი, Next.js-ის სტანდარტული მიდგომა
      router.push(`/my-chats?chatId=${notification.chatId}`);
    } catch (err) {
      console.error("Error joining chat from notification:", err);
      setError("Failed to join chat");
      alert("Failed to join chat, please try again later");
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    if (!user || !user.isAdmin) return;

    try {
      setProcessing(notificationId);
      
      // სრულად წავშალოთ შეტყობინება Firestore-დან
      await deleteDoc(doc(db, "admin_notifications", notificationId));
      
      // განვაახლოთ ლოკალური state-ი წაშლილი შეტყობინების მოსაშორებლად
      setWalletNotifications(prevNotifications => 
        prevNotifications.filter(notification => notification.id !== notificationId)
      );
      
      setDeleteConfirmation(null);
    } catch (err) {
      console.error("Error deleting notification:", err);
      setError("Failed to delete notification");
    } finally {
      setProcessing(null);
    }
  };

  // Filter notifications based on search query
  const filteredNotifications = walletNotifications.filter(notification => {
    if (!searchQuery) return true;
    
    const lowerCaseQuery = searchQuery.toLowerCase();
    return (
      notification.productName.toLowerCase().includes(lowerCaseQuery) ||
      notification.buyerName.toLowerCase().includes(lowerCaseQuery) ||
      notification.sellerName.toLowerCase().includes(lowerCaseQuery) ||
      notification.walletAddress.toLowerCase().includes(lowerCaseQuery)
    );
  });

  // გადახდის შეტყობინების დამუშავება და ჩატში შესვლა
  const handleJoinChatFromPayment = async (notification: PaymentNotification) => {
    if (!user || !user.isAdmin) return;

    try {
      setProcessing(notification.id);

      // Get chat data to verify it exists
      const chatDocRef = doc(db, "chats", notification.chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }

      // Check if admin is already part of the chat participants
      const chatData = chatDoc.data();
      if (!chatData.participants.includes(user.id)) {
        // Update the chat to add admin as a participant
        await updateDoc(chatDocRef, {
          adminJoined: true,
          participants: [...chatData.participants, user.id],
          participantNames: {
            ...chatData.participantNames,
            [user.id]: user.name
          },
          participantPhotos: {
            ...chatData.participantPhotos,
            [user.id]: user.photoURL || ""
          }
        });
      }

      // Mark notification as read
      await updateDoc(doc(db, "admin_notifications", notification.id), {
        read: true,
        needsAction: false
      });

      // Log the chat ID we're navigating to
      console.log('Navigating to chat from payment notification:', notification.chatId);
      
      // შევინახოთ ჩატის ID ლოკალურად
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastChatId', notification.chatId);
      }
      
      // გამოვიყენოთ query პარამეტრი, Next.js-ის სტანდარტული მიდგომა
      router.push(`/my-chats?chatId=${notification.chatId}`);
    } catch (err) {
      console.error("Error joining chat from payment notification:", err);
      setError("Failed to join chat");
      alert("Failed to join chat, please try again later");
    } finally {
      setProcessing(null);
    }
  };
  
  // გადახდის შეტყობინების წაშლა
  const handleDeletePaymentNotification = async (notificationId: string) => {
    if (!user || !user.isAdmin) return;

    try {
      setProcessing(notificationId);
      
      // სრულად წავშალოთ შეტყობინება Firestore-დან
      await deleteDoc(doc(db, "admin_notifications", notificationId));
      
      // განვაახლოთ ლოკალური state-ი წაშლილი შეტყობინების მოსაშორებლად
      setPaymentNotifications(prevNotifications => 
        prevNotifications.filter(notification => notification.id !== notificationId)
      );
      
    } catch (err) {
      console.error("Error deleting payment notification:", err);
      setError("Failed to delete payment notification");
    } finally {
      setProcessing(null);
    }
  };

  // გადახდიდან ჩატში შესვლა
  const handleJoinChatFromPaidPayment = async (payment: PaidPayment) => {
    if (!user || !user.isAdmin) return;
    
    try {
      setProcessing(payment.id);
      
      // Get chat data to verify it exists
      const chatDocRef = doc(db, "chats", payment.chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }
      
      // Get product name
      const productDocRef = doc(db, "products", payment.productId);
      const productDoc = await getDoc(productDocRef);
      const productName = productDoc.exists() ? productDoc.data()?.displayName || "Unknown Product" : "Unknown Product";

      // Get user name
      const userDocRef = doc(db, "users", payment.userId);
      const userDoc = await getDoc(userDocRef);
      const userName = userDoc.exists() ? userDoc.data()?.name || "Unknown User" : "Unknown User";

      // Check if admin is already part of the chat participants
      const chatData = chatDoc.data();
      
      if (!chatData.participants.includes(user.id)) {
        // Update the chat to add admin as a participant (ტაიმერის გარეშე)
        await updateDoc(chatDocRef, {
          adminJoined: true,
          participants: [...chatData.participants, user.id],
          participantNames: {
            ...chatData.participantNames,
            [user.id]: user.name
          },
          participantPhotos: {
            ...chatData.participantPhotos,
            [user.id]: user.photoURL || ""
          }
          // აღარ ვააქტიურებთ ტაიმერს ავტომატურად
        });
      }

      // Log the chat ID we're navigating to
      console.log('Navigating to chat from paid payment:', payment.chatId);
      
      // შევინახოთ ჩატის ID ლოკალურად
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastChatId', payment.chatId);
      }
      
      // გამოვიყენოთ query პარამეტრი, Next.js-ის სტანდარტული მიდგომა
      router.push(`/my-chats?chatId=${payment.chatId}`);
    } catch (err) {
      console.error("Error joining chat from paid payment:", err);
      setError("Failed to join chat");
      alert("Failed to join chat, please try again later");
    } finally {
      setProcessing(null);
    }
  };
  
  // გადახდის ჩანაწერის წაშლა
  const handleDeletePaidPayment = async (paymentId: string) => {
    if (!user || !user.isAdmin) return;
    
    try {
      setProcessing(paymentId);
      
      // სრულად წავშალოთ ჩანაწერი Firestore-დან
      await deleteDoc(doc(db, "paid", paymentId));
      
      // განვაახლოთ ლოკალური state
      setPaidPayments(prevPayments => 
        prevPayments.filter(payment => payment.id !== paymentId)
      );
      
    } catch (err) {
      console.error("Error deleting paid payment:", err);
      setError("Failed to delete paid payment");
    } finally {
      setProcessing(null);
    }
  };

  // ტაიმერის დაწყების ფუნქცია
  const handleStartTimer = async (chatId: string) => {
    if (!user || !user.isAdmin) return;
    
    try {
      setProcessing(chatId);
      
      // ჯერ შევამოწმოთ არის თუ არა ადმინისტრატორი ჩატში
      const chatDocRef = doc(db, "chats", chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }
      
      const chatData = chatDoc.data();
      
      // შევამოწმოთ არის თუ არა ადმინი ჩატის მონაწილე
      if (!chatData.participants.includes(user.id)) {
        // თუ არ არის, ჯერ დავამატოთ ადმინი ჩატში
        console.log("Administrator is not in the chat yet, adding...");
        
        await updateDoc(chatDocRef, {
          adminJoined: true,
          participants: [...chatData.participants, user.id],
          participantNames: {
            ...chatData.participantNames,
            [user.id]: user.name
          },
          participantPhotos: {
            ...chatData.participantPhotos,
            [user.id]: user.photoURL || ""
          }
        });
        
        console.log("Administrator successfully added to chat");
      }
      
      // გამოვიძახოთ Cloud Function ტაიმერის დასაწყებად
      try {
        const startTimerFunction = httpsCallable(functions, 'startTransferTimer');
        const result = await startTimerFunction({
          chatId
        });
        
        // სერვერიდან მიღებული მონაცემები
        const data = result.data as { success: boolean, transferReadyTime: number };
        
        if (data.success) {
          alert("Timer started successfully!");
          
          // ლოკალური სტეიტის განახლება ამ ჩატისთვის
          setChatTimerStatus(prevStatus => ({
            ...prevStatus,
            [chatId]: true
          }));
        } else {
          console.warn("Failed to start timer on server");
        }
      } catch (functionError) {
        console.error("Cloud Function-ის გამოძახება წარუმატებელია:", functionError);
        throw functionError; // გადავაგდოთ შეცდომა, რადგან ვერ შევძელით ტაიმერის დაწყება
      }
      
    } catch (error) {
      console.error("Error starting timer:", error);
      alert(`Failed to start timer: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  // დავამატოთ ფუნქცია, რომელიც დაამუშავებს "I am primary owner" ღილაკზე დაჭერას
  const handleAssignPrimaryOwner = async (chatId: string) => {
    if (!user || !user.isAdmin) return;
    
    try {
      setProcessing(chatId);
      
      const chatDocRef = doc(db, "chats", chatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        throw new Error("Chat not found");
      }
      
      console.log("Chat before update:", chatDoc.data());
      
      // განვაახლოთ ჩატის დოკუმენტი და დავნიშნოთ ადმინი primary owner-ად
      const updateData = {
        primaryOwner: user.id,
        primaryOwnerAssignedAt: Date.now(),
        transferCompleted: true, // ჩავთვალოთ რომ ტრანსფერი დასრულებულია
        transferTimerEnded: true // მივუთითოთ რომ ტაიმერი დასრულებულია
      };
      
      console.log("Updating chat with data:", updateData);
      
      await updateDoc(chatDocRef, updateData);
      
      // ასევე გავაგზავნოთ სისტემური შეტყობინება ჩატში
      const messagesRef = ref(rtdb, `messages/${chatId}`);
      await push(messagesRef, {
        text: `Administrator ${user.name || 'Admin'} has been assigned as primary owner.`,
        senderId: "system",
        senderName: "System",
        timestamp: Date.now(),
        isSystem: true
      });
      
      console.log("Primary owner assigned successfully");
      
      // განვაახლოთ სტეიტები
      const newChatTimerStatus = {
        ...chatTimerStatus,
        [chatId]: false // ტაიმერი აღარ არის აქტიური, რადგან ადმინი გახდა მფლობელი
      };
      
      const newChatTransferStatus = {
        ...chatTransferStatus,
        [chatId]: {
          ...chatTransferStatus[chatId],
          transferCompleted: true, // დავამატოთ ტრანსფერის დასრულების მარკერი
          primaryOwner: true // Add new flag to indicate admin is primary owner
        }
      };
      
      console.log("New chat timer status:", newChatTimerStatus);
      console.log("New chat transfer status:", newChatTransferStatus);
      
      setChatTimerStatus(newChatTimerStatus);
      setChatTransferStatus(newChatTransferStatus);
      
      alert("You have successfully assigned the primary owner!");
      
    } catch (error) {
      console.error("Error assigning primary owner:", error);
      alert(`Failed to assign primary owner: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  if (!user || !user.isAdmin) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md">
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md">
        <p>{error}</p>
      </div>
    );
  }

  if (requests.length === 0 && walletNotifications.length === 0 && paidPayments.length === 0) {
    return (
      <div className="p-6 sm:p-8 border-b bg-gradient-to-r from-gray-800 to-indigo-900 text-white rounded-t-xl">
        <div className="flex flex-col sm:flex-row items-start justify-between">
          <div className="flex items-center mb-4 sm:mb-0">
            <div className="mr-3">
              {userPhoto ? (
                <Image
                  src={userPhoto}
                  alt={userName}
                  width={48}
                  height={48}
                  className="rounded-full bg-white p-1 w-12 h-12 object-cover"
                />
              ) : (
                <Image
                  src="/agent.png"
                  alt="Escrow Agent Logo"
                  width={48}
                  height={48}
                  className="rounded-full bg-white p-1"
                />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Escrow Agent Dashboard</h1>
              <p className="text-sm text-indigo-200">Manage escrow services with high security</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button 
              onClick={onOpenProductsModal}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2H9z" clipRule="evenodd" />
              </svg>
              Product Management
            </button>
            
            <button 
              onClick={onOpenEscrowChats}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
              Private Chats
            </button>
            
            {profilePhotoUploader}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-xl border border-gray-200 overflow-hidden w-full">
      {/* Add style tag for custom animations */}
      <style jsx>{subtleAnimationStyles}</style>
      
      <div className="p-6 sm:p-8 border-b bg-gradient-to-r from-gray-800 to-indigo-900 text-white rounded-t-xl">
        <div className="flex flex-col sm:flex-row items-start justify-between">
          <div className="flex items-center mb-4 sm:mb-0">
            <div className="mr-3">
              {userPhoto ? (
                <Image
                  src={userPhoto}
                  alt={userName}
                  width={48}
                  height={48}
                  className="rounded-full bg-white p-1 w-12 h-12 object-cover"
                />
              ) : (
                <Image
                  src="/agent.png"
                  alt="Escrow Agent Logo"
                  width={48}
                  height={48}
                  className="rounded-full bg-white p-1"
                />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Escrow Agent Dashboard</h1>
              <p className="text-sm text-indigo-200">Manage escrow services with high security</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button 
              onClick={onOpenProductsModal}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2H9z" clipRule="evenodd" />
              </svg>
              Product Management
            </button>
            
            <button 
              onClick={onOpenEscrowChats}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
              Private Chats
            </button>
            
            {profilePhotoUploader}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        

        {/* თუ გვაქვს ესქროუ მოთხოვნები */}
        {/* საფულის მისამართები */}
        {paidPayments.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <span className="bg-green-100 rounded-full p-2 flex items-center justify-center mr-2">
                  <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                </span>
                <h3 className="text-lg font-semibold">Wallet Addresses <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full ml-2">{paidPayments.length}</span></h3>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="flex gap-2 mr-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-700 rounded-full mr-1"></div>
                      <span className="text-xs text-gray-700">Completed</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
                      <span className="text-xs text-gray-700"> Primary Owner</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-yellow-100 rounded-full mr-1"></div>
                      <span className="text-xs text-gray-700">Timer</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-100 rounded-full mr-1"></div>
                      <span className="text-xs text-gray-700">Transfer</span>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                    </svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    className="block w-full p-2 pl-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="w-full overflow-hidden border rounded-lg">
              <div className="overflow-x-auto">
                <div className="max-h-[50vh] sm:max-h-[60vh] md:max-h-[70vh] lg:max-h-[75vh] overflow-y-auto">
                  <table className="w-full border-collapse">
                    <thead className="bg-green-600 text-white sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2 text-left border-r border-green-500">Product Name / Price</th>
                        <th className="px-4 py-2 text-left border-r border-green-500">Buyer / Seller</th>
                        <th className="px-4 py-2 text-left border-r border-green-500">Wallet Address</th>
                        <th className="px-4 py-2 text-left border-r border-emerald-500 bg-emerald-600">Transaction</th>
                        <th className="px-4 py-2 text-left border-r border-green-500">Date</th>
                        <th className="px-4 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidPayments.map((payment, index) => (
                        <tr key={payment.id} className={`border-b ${
                          chatTransferStatus[payment.chatId]?.buyerConfirmedPayment 
                            ? 'bg-green-100 animate-subtle-pulse' // მწვანე ფონი მყიდველის მიერ დადასტურებული გადახდისთვის
                            : chatTransferStatus[payment.chatId]?.primaryOwner
                              ? 'bg-blue-100 animate-subtle-pulse' // Light blue for primary owner
                              : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
                                ? 'bg-red-100 animate-subtle-pulse' 
                                : chatTransferStatus[payment.chatId]?.timerEnded 
                                  ? 'bg-yellow-100 animate-subtle-pulse' 
                                  : chatTimerStatus[payment.chatId]
                                    ? 'bg-yellow-100 animate-subtle-pulse'
                                    : !chatTimerStatus[payment.chatId] 
                                      ? 'bg-gray-100' 
                                      : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                        } hover:bg-gray-100`}>
                          <td className={`px-4 py-4 border-r border-gray-200 ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>
                            <div className="flex items-center">
                              <div className="bg-green-100 p-2 rounded-full flex items-center justify-center mr-3">
                                <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium">{payment.chatName || "Product"}</div>
                                <div className="text-sm text-gray-500">${payment.amount}</div>
                              </div>
                            </div>
                          </td>
                          <td className={`px-4 py-4 border-r border-gray-200 ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>
                            <div className="flex flex-col">
                              <div className="flex items-center text-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                                <span className="text-blue-600 font-medium">Buyer:</span>
                                <span className="ml-1">{payment.buyerName || "N/A"}</span>
                              </div>
                              <div className="flex items-center text-sm mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                                <span className="text-purple-600 font-medium">Seller:</span>
                                <span className="ml-1">{payment.sellerName || "N/A"}</span>
                              </div>
                              <div className="flex items-center mt-1.5">
                                {chatTransferStatus[payment.chatId]?.buyerConfirmedPayment ? (
                                  <div className="flex items-center text-xs">
                                    <div className="relative">
                                      <div className="h-3 w-3 bg-green-700 rounded-full animate-subtle-pulse"></div>
                                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full"></span>
                                    </div>
                                    <span className="ml-1.5 text-green-700 font-bold">DONE</span>
                                  </div>
                                ) : chatTransferStatus[payment.chatId]?.primaryOwner ? (
                                  <div className="flex items-center text-xs">
                                    <div className="relative">
                                      <div className="h-3 w-3 bg-blue-500 rounded-full animate-subtle-pulse"></div>
                                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-300 rounded-full"></span>
                                    </div>
                                    <span className="ml-1.5 text-blue-600 font-medium">I am primary owner</span>
                                  </div>
                                ) : chatTimerStatus[payment.chatId] && 
                                    !chatTransferStatus[payment.chatId]?.timerEnded && 
                                    !chatTransferStatus[payment.chatId]?.transferInitiated ? (
                                  <div className="flex items-center text-xs">
                                    <div className="relative">
                                      <div className="h-3 w-3 bg-green-500 rounded-full animate-subtle-pulse"></div>
                                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-300 rounded-full"></span>
                                    </div>
                                    <span className="ml-1.5 text-green-600 font-medium">Timer Active</span>
                                  </div>
                                ) : chatTransferStatus[payment.chatId]?.timerEnded ? (
                                  <div className="flex items-center text-xs">
                                    <div className="relative">
                                      <div className="h-3 w-3 bg-yellow-500 rounded-full animate-subtle-pulse"></div>
                                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-yellow-300 rounded-full animate-subtle-ping"></span>
                                    </div>
                                    <span className="ml-1.5 text-yellow-600 font-semibold">Timer Ended</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center text-xs">
                                    <div className="relative">
                                      <div className="h-3 w-3 bg-gray-400 rounded-full"></div>
                                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-gray-300 rounded-full"></span>
                                    </div>
                                    <span className="ml-1.5 text-gray-600 font-medium">Timer Not Started</span>
                                  </div>
                                )}
                              </div>
                              {/* მფლობელობის გადაცემის ინდიკატორი */}
                              {chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted && (
                                <div className="flex items-center mt-1.5">
                                  <div className="relative">
                                    <div className="h-3 w-3 bg-red-500 rounded-full animate-subtle-pulse"></div>
                                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-300 rounded-full animate-subtle-ping"></span>
                                  </div>
                                  <span className="ml-1.5 text-red-600 font-medium text-xs">Ownership transferred - confirmation needed!</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className={`px-4 py-4 border-r border-gray-200 ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>
                            <div className="text-center">
                              <span className="bg-gray-100 text-gray-800 py-1 px-2 rounded font-mono text-xs inline-block">
                                {payment.stripeSessionId ? payment.stripeSessionId.substring(0, 16) + "..." : "N/A"}
                              </span>
                            </div>
                          </td>
                          <td className={`px-4 py-4 border-r border-gray-200 ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>
                            <div className="flex justify-center">
                              {chatTransferStatus[payment.chatId]?.buyerConfirmedPayment ? (
                                <span className="py-1 px-3 rounded-full text-xs inline-block bg-green-700 text-white font-bold">
                                  DONE
                                </span>
                              ) : (
                                <span className={`py-1 px-3 rounded-full text-xs inline-block ${payment.paymentMethod === 'stripe' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                  {payment.paymentMethod === 'stripe' ? 'Stripe' : 'Bitcoin'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`px-4 py-4 border-r border-gray-200 ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>
                            <div className="flex flex-col">
                              <div className="text-xs text-gray-500 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {new Date(payment.createdAt).toLocaleDateString()} {new Date(payment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                            </div>
                          </td>
                          <td className={`px-4 py-4 relative ${
  chatTransferStatus[payment.chatId]?.buyerConfirmedPayment
    ? 'bg-green-100'
    : chatTransferStatus[payment.chatId]?.primaryOwner
      ? 'bg-blue-100'
      : chatTransferStatus[payment.chatId]?.transferInitiated && !chatTransferStatus[payment.chatId]?.transferCompleted 
        ? 'bg-red-100' 
        : chatTransferStatus[payment.chatId]?.timerEnded 
          ? 'bg-yellow-100' 
          : chatTimerStatus[payment.chatId]
            ? 'bg-yellow-100'
            : !chatTimerStatus[payment.chatId] 
              ? 'bg-gray-100' 
              : ''
}`}>

                            <div className="flex justify-center gap-1">
                              <button 
                                onClick={() => handleJoinChatFromPaidPayment(payment)}
                                disabled={processing === payment.id}
                                className="px-3 py-1 bg-green-500 text-white text-xs font-medium rounded hover:bg-green-600 transition-colors"
                              >
                                To Chat
                              </button>
                              {!chatTransferStatus[payment.chatId]?.timerEnded && 
                               !chatTransferStatus[payment.chatId]?.primaryOwner &&
                               !chatTransferStatus[payment.chatId]?.transferInitiated &&
                               !chatTransferStatus[payment.chatId]?.buyerConfirmedPayment &&
                               !chatTransferStatus[payment.chatId]?.sellerConfirmedReceipt && (
                                <button 
                                  onClick={() => handleStartTimer(payment.chatId)}
                                  disabled={processing === payment.chatId || processing === payment.id || chatTimerStatus[payment.chatId]}
                                  title={chatTimerStatus[payment.chatId] ? "Timer is already active" : "Start the timer for this transaction"}
                                  className={`px-3 py-1 ${chatTimerStatus[payment.chatId] ? 'bg-green-600 hover:bg-green-700 cursor-not-allowed opacity-80' : 'bg-blue-500 hover:bg-blue-600'} text-white text-xs font-medium rounded transition-colors`}
                                >
                                  {processing === payment.chatId ? (
                                    <div className="flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1"></div>
                                      <span>...</span>
                                    </div>
                                  ) : chatTimerStatus[payment.chatId] ? 'Active' : 'Start'}
                                </button>
                              )}
                              {/* დავამატოთ "I am primary owner" ღილაკი მხოლოდ მაშინ როცა:
                                  1. მყიდველმა დაადასტურა გადაცემა (transferInitiated: true)
                                  2. ტრანსფერი ჯერ არ დასრულებულა (transferCompleted: false) */}
                              {chatTransferStatus[payment.chatId]?.transferInitiated && 
                                !chatTransferStatus[payment.chatId]?.transferCompleted && 
                                !chatTransferStatus[payment.chatId]?.primaryOwner && (
                                <button 
                                  onClick={() => handleAssignPrimaryOwner(payment.chatId)}
                                  disabled={processing === payment.chatId || processing === payment.id}
                                  className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors animate-subtle-pulse shadow-lg border-2 border-red-400"
                                >
                                  I am primary owner
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeletePaidPayment(payment.id)}
                                disabled={processing === payment.id}
                                className="px-3 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* თუ გვაქვს "Wallet Added" ნოტიფიკაციები */}
        {walletNotifications.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
              Wallet Information ({walletNotifications.length})
            </h3>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 max-h-[50vh] sm:max-h-[60vh] md:max-h-[70vh] lg:max-h-[75vh] overflow-y-auto pr-2">
              {walletNotifications.map((notification) => (
                <div key={notification.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-shadow duration-200">
                  <div className="flex justify-between items-start">
                    <div className="text-sm font-medium text-gray-500">
                      {new Date(notification.createdAt).toLocaleString()}
                    </div>
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                      {notification.read ? 'Read' : 'New'}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-base font-semibold text-gray-900">
                      Product: {notification.productName}
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      <p>Buyer: {notification.buyerName}</p>
                      <p>Seller: {notification.sellerName}</p>
                      <p className="mt-1 font-mono text-xs bg-gray-100 rounded p-1">
                        {notification.walletAddress}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex space-x-2">
                    <button
                      onClick={() => handleJoinChatFromNotification(notification)}
                      disabled={processing === notification.id}
                      className="flex-1 inline-flex justify-center items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing === notification.id ? 'Processing...' : 'Join Chat'}
                    </button>
                    <button
                      onClick={() => handleDeleteNotification(notification.id)}
                      disabled={processing === notification.id}
                      className="inline-flex justify-center items-center px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showDetailsModal && selectedNotification && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-800 bg-opacity-75">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Information</h3>
              <button 
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Product Name</label>
                <p className="mt-1 text-sm text-gray-900">{selectedNotification.productName}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Wallet Address</label>
                <p className="mt-1 text-sm text-gray-900 font-mono break-all">{selectedNotification.walletAddress}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Buyer</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedNotification.buyerName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Seller</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedNotification.sellerName}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount</label>
                  <p className="mt-1 text-sm text-gray-900">${selectedNotification.amount}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedNotification.paymentMethod}</p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button 
                onClick={() => setShowDetailsModal(false)}
                className="inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Close
              </button>
              <button
                onClick={() => handleJoinChatFromNotification(selectedNotification)}
                className="inline-flex justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Join Chat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
} 