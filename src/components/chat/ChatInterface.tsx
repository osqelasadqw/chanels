"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { Chat, Message } from "@/types/chat";
import { db, rtdb, functions, auth } from "@/firebase/config";
import { ref, push, onValue, off } from "firebase/database";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { addDoc, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import React from "react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

interface ChatInterfaceProps {
  chatId: string;
  productId: string;
}

export default function ChatInterface({ chatId, productId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [chatData, setChatData] = useState<Chat | null>(null);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isSubmittingWallet, setIsSubmittingWallet] = useState<boolean>(false);
  const [isWalletSubmitted, setIsWalletSubmitted] = useState<boolean>(false);
  const [paymentCompleted, setPaymentCompleted] = useState<boolean>(false);
  const [sellerConfirmed, setSellerConfirmed] = useState<boolean>(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState<boolean>(false);
  const [adminEmailsList, setAdminEmailsList] = useState<string[]>([]); // State for admin emails
  const [escrowAgentAssigned, setEscrowAgentAssigned] = useState<boolean>(false); // New state
  const [selectedAgentEmail, setSelectedAgentEmail] = useState<string>("");  // State for selected agent email
  const [showAgentEmailDropdown, setShowAgentEmailDropdown] = useState<boolean>(false);
  const [assigningManagerRights, setAssigningManagerRights] = useState<boolean>(false); // State for loading
  const [confirmingOffer, setConfirmingOffer] = useState<boolean>(false); // New state for Confirm Offer loading
  const [returningPayment, setReturningPayment] = useState<boolean>(false); // New state for Return Payment loading
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false); // სმაილების გამოჩენის კონტროლი
  const emojiPickerRef = useRef<HTMLDivElement>(null); // სმაილების კონტეინერის რეფერენსი
  
  // ტაიმერის სტეიტები
  const [transferTimerStarted, setTransferTimerStarted] = useState<boolean>(false);
  const [transferReadyTime, setTransferReadyTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState<{days: number, hours: number, minutes: number, seconds: number} | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // ახალი სტეიტები timerActive-ისთვის და ტაიმერის დროებისთვის
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [timerEndDate, setTimerEndDate] = useState<number | null>(null);

  // ფუნქცია ტაიმერის განახლებისთვის - მდებარეობს კომპონენტის დასაწყისში, ჰუკების შემდეგ
  const updateRemainingTime = () => {
    if (!transferReadyTime) return;
    
    const now = Date.now();
    const remainingMs = Math.max(0, transferReadyTime - now);
    
    if (remainingMs <= 0) {
      setRemainingTime({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      });
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    
    setRemainingTime({ days, hours, minutes, seconds });
  };

  // Fetch chat data and messages
  useEffect(() => {
    if (!chatId || !user) return;

    setLoading(true);
    setError(null);

    // გავასუფთავოთ წინა ჩატის მდგომარეობა, როდესაც ახალ ჩატზე გადავდივართ
    setTransferTimerStarted(false);
    setTransferReadyTime(null);
    setTimerActive(false);
    setTimerEndDate(null);
    setRemainingTime(null);
    setWalletAddress("");
    setShowPaymentDropdown(false);
    
    // გავასუფთავოთ ინტერვალი, თუ ის არსებობს
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('lastChatId', chatId);
    }

    // Get chat data from Firestore
    const fetchChatData = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDoc = await getDoc(chatDocRef);
        
        if (chatDoc.exists()) {
          const data = chatDoc.data() as Chat;
          setChatData(data);
          
          // Check if seller has confirmed
          setSellerConfirmed(!!data.sellerConfirmed);
          
          // Check payment status
          const isPaymentDone = !!data.paymentCompleted;
          setPaymentCompleted(isPaymentDone);
          
          // ტაიმერის მონაცემების შემოწმება - ახალი კოდი ტაიმერის სწორად აღმოსაჩენად
          
          // შევამოწმოთ როგორც ძველი (timerActive), ასევე ახალი (transferTimerStarted) ფორმატის ტაიმერები
          if (data.transferTimerStarted && data.transferReadyTime) {
            setTransferTimerStarted(true);
            setTransferReadyTime(data.transferReadyTime);
            setTimerActive(true);
            setTimerEndDate(data.transferReadyTime);
          } 
          else if (data.timerActive && data.timerEndDate) {
            setTimerActive(true);
            setTimerEndDate(data.timerEndDate);
            // ასევე დავაყენოთ ტრანსფერის ტაიმერის მნიშვნელობებიც თავსებადობისთვის
            setTransferTimerStarted(true);
            setTransferReadyTime(data.timerEndDate);
          } else {
            // No active timer found
          }
          
        } else {
          setError("Chat not found");
        }
      } catch (err) {
        setError("Failed to load chat data");
      }
    };

    fetchChatData();

    // Fetch admin emails
    const fetchAdminEmails = async () => {
      try {
        const getEmailsFunction = httpsCallable(functions, 'getAdminEmails');
        const result = await getEmailsFunction();
        const data = result.data as { adminEmails: string[] };
        if (data && data.adminEmails) {
          setAdminEmailsList(data.adminEmails);
        } else {
          setAdminEmailsList([]); // Set to empty if no emails or error
        }
      } catch (err) {
        // Optionally set an error state here if needed for UI
        setAdminEmailsList([]); // Set to empty on error
      }
    };

    if (user) { // Fetch emails only if user is available
      fetchAdminEmails();
    }

    // Listen for messages from Realtime Database
    const messagesRef = ref(rtdb, `messages/${chatId}`);
    
    onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messageList = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...value as Omit<Message, 'id'>
        }));
        
        // Sort messages by timestamp
        messageList.sort((a, b) => a.timestamp - b.timestamp);
        
        setMessages(messageList);
        
        // შევამოწმოთ გადახდის დადასტურების შეტყობინება
        const paymentConfirmationMessage = messageList.find(msg => msg.isPaymentConfirmation);
        if (paymentConfirmationMessage) {
          setPaymentCompleted(true);
          
          // ასევე შეიძლება ვცადოთ Firestore-ში ვეძებოთ გადახდის სტატუსი თუ რეალურ დროში არ მოგვაქვს
          // ეს საშუალებას გვაძლევს დავინახოთ გადახდის სტატუსის ცვლილები მყისიერად
          fetchChatData();
        }
      } else {
        // თუ მონაცემები არ არის, ცარიელი მასივი დავაყენოთ
        setMessages([]);
      }
      setLoading(false);
    }, (err) => {
      setError("Failed to load messages");
      setLoading(false);
    });

    // რეალურ დროში შევამოწმოთ გადახდის სტატუსი ჩატის დოკუმენტის მოთხოვნით
    // ეს საშუალებას გვაძლევს დავინახოთ გადახდის სტატუსის ცვლილებები მყისიერად
    const chatDocRef = doc(db, "chats", chatId);
    const unsubscribeChatDocListener = onSnapshot(chatDocRef, (chatDocSnapshot) => {
      if (chatDocSnapshot.exists()) {
        const updatedChatData = chatDocSnapshot.data() as Chat;
        
        // განვაახლოთ ჩატის მონაცემები state-ში
        setChatData(updatedChatData);
        
        // შევამოწმოთ გადახდის სტატუსი
        if (updatedChatData.paymentCompleted) {
          setPaymentCompleted(true);
        }
        
        // შევამოწმოთ გამყიდველის დადასტურების სტატუსი და განვაახლოთ
        if (updatedChatData.sellerConfirmed) {
          setSellerConfirmed(true);
        }
      }
    });

    return () => {
      // Clean up listeners
      off(messagesRef);
      unsubscribeChatDocListener();
    };
  }, [chatId, user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  
  // ემოჯის დაჭერის დამუშავების ფუნქცია
  const handleEmojiClick = (emojiObject: EmojiClickData) => {
    // დავამატოთ ემოჯი მიმდინარე შეტყობინებაში კურსორის პოზიციაზე ან ბოლოში
    const emoji = emojiObject.emoji;
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false); // დავხუროთ ემოჯის არჩევის პანელი
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !user || !chatId) return;

    try {
      const messagesRef = ref(rtdb, `messages/${chatId}`);
      
      const timestamp = Date.now();
      
      // Check if this is an escrow request message
      const isEscrowRequest = newMessage.trim().includes("🔒 Request to Purchase");
      
      // გადავამოწმოთ რომ მომხმარებლის ფოტოს URL სწორია და არის სტრინგი
      const photoURL = typeof user.photoURL === 'string' ? user.photoURL : null;
      
      await push(messagesRef, {
        text: newMessage.trim(),
        senderId: user.id,
        senderName: user.name,
        senderPhotoURL: photoURL, // მომხმარებლის ფოტო, თუ აქვს
        timestamp: timestamp,
        isAdmin: user.isAdmin,
        // If this is an escrow message, we'll use the special formatting
        isEscrowRequest: isEscrowRequest
      });
      
      // განვაახლოთ ჩატში lastMessage ველი, რომ ჩატების სიაში სწორად გამოჩნდეს მესიჯი
      try {
        // ჩატის დოკუმენტის განახლება Firestore-ში
        const chatDocRef = doc(db, "chats", chatId);
        await updateDoc(chatDocRef, {
          lastMessage: {
            text: newMessage.trim(),
            timestamp: timestamp,
            senderId: user.id
          }
        });
      } catch (err) {
        // Error updating chat lastMessage
      }
      
      setNewMessage("");
    } catch (err) {
      setError("Failed to send message");
    }
  };

  const handleRequestAdmin = async () => {
    if (!user || !chatId) return;

    try {
      const adminRequestsRef = ref(rtdb, `adminRequests`);
      
      // Generate a unique ID for this request
      const requestTimestamp = Date.now();
      const requestData = {
        chatId,
        productId,
        productName: chatData?.productName || 'Unknown Product',
        requestedBy: user.id,
        requestedByName: user.name,
        timestamp: requestTimestamp
      };
      
      // გაგზავნა
      await push(adminRequestsRef, requestData);
      
      // დადასტურება
      alert("Escrow agent request sent successfully!");
      
    } catch (err) {
      setError("Failed to request admin");
      alert("Failed to request escrow agent. Please try again.");
    }
  };

  // Save seller's wallet address
  const handleSubmitWalletAddress = async () => {
    if (!walletAddress) return;

    setIsSubmittingWallet(true);
    try {
      if (walletAddress === 'bitcoin') {
        // Bitcoin გადახდის ლოგიკა
        // Create a notification for the admin
        await addDoc(collection(db, "admin_notifications"), {
          type: "payment_intent",
          chatId,
          productId: chatData?.productId || '',
          productName: chatData?.productName || 'Unknown Product',
          buyerName: user?.name || "Unknown Buyer",
          buyerId: user?.id,
          paymentMethod: walletAddress,
          createdAt: Date.now(),
          read: false
        });

        // Show success message
        setIsWalletSubmitted(true);
      } else if (walletAddress === 'card') {
        try {
          // მივიღოთ მომხმარებლის ტოკენი
          const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : '';
          
          // თუ ტოკენი არ გვაქვს, შეცდომა გამოვაქვეყნოთ
          if (!token) {
            throw new Error('Authentication required. Please log in again.');
          }

          // მივიღოთ current window საიტის origin-ი
          const origin = window.location.origin;

          // სწორი URL-ი HTTPS პროტოკოლით
          const functionUrl = 'https://us-central1-projec-cca43.cloudfunctions.net/createPaymentSessionHttp';

          // fetch-ის გამოყენებით გამოვიძახოთ HTTP ფუნქცია
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Origin': origin
            },
            body: JSON.stringify({
              chatId,
              userId: user?.id,
              origin
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
          }
          
          const data = await response.json();
          
          if (!data.url) {
            throw new Error('No checkout URL returned from server');
          }
          
          // გადავამისამართოთ Stripe Checkout გვერდზე
          window.location.href = data.url;
          return; // ვწყვეტთ ფუნქციას, რადგან Stripe checkout გვერდზე გადადის
        } catch (fetchError) {
            // დავამატოთ შეტყობინების ჩვენება
          const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
            alert(`Failed to initiate credit card payment: ${errorMessage}. Please try again.`);
            
            setIsSubmittingWallet(false);
            return;
        }
      }
    } catch (error) {
      // დავამატოთ შეტყობინების ჩვენება
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to process payment: ${errorMessage}. Please try again later.`);
      
      setIsSubmittingWallet(false);
    } finally {
      setIsSubmittingWallet(false);
    }
  };

  // Function to handle assigning manager rights to escrow agent
  const handleAssignManagerRights = async () => {
    if (!user || !chatId || !chatData?.sellerId || user.id !== chatData.sellerId) {
      setError("Only the seller can assign manager rights.");
      return;
    }
    
    const adminEmail = selectedAgentEmail.trim();

    if (!adminEmail) {
      alert("Please select or enter an escrow agent's email.");
      return;
    }

    try {
      setAssigningManagerRights(true); // Set loading state to true at the beginning
      
      const assignRightsFunction = httpsCallable(functions, 'assignManagerRightsToAdmin');
      await assignRightsFunction({ chatId, adminEmail });
      
      setEscrowAgentAssigned(true); // Update state to hide the button
      // Optionally, update chatData locally or rely on Firestore listener
      alert(`Manager rights assigned to ${adminEmail}. The admin has been notified.`);

    } catch (err) {
      const httpsError = err as any; 
      if (httpsError.code && httpsError.message) {
        setError(`Error: ${httpsError.message} (code: ${httpsError.code})`);
      } else {
        setError("Failed to assign manager rights. Please try again.");
      }
      alert(`Failed to assign manager rights: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAssigningManagerRights(false); // Reset loading state when done (success or failure)
    }
  };

  // განახლებული ფუნქცია აგენტთან კონტაქტისთვის
  const handleContactEscrowAgent = async () => {
    if (!user) return;
    
    try {
      // პირდაპირ შევქმნათ ახალი ჩატი Firebase-ში
      const newChatRef = collection(db, "chats");
      const now = Date.now();
      
      // მოვძებნოთ აგენტის ელფოსტა
      let agentEmail = adminEmailsList.length > 0 ? adminEmailsList[0] : null;
      
      if (!agentEmail) {
        alert("No escrow agents found. Please contact support directly.");
        return;
      }
      
      // მოვძებნოთ პროდუქტის სახელი, თუ პროდუქტი ხელმისაწვდომია
      let productName = "Unknown Product";
      if (productId) {
        try {
          const productDocRef = doc(db, "products", productId);
          const productDoc = await getDoc(productDocRef);
          if (productDoc.exists()) {
            productName = productDoc.data().displayName || productDoc.data().name || "Unknown Product";
          }
        } catch (err) {
          console.error("Error fetching product details:", err);
        }
      }
      
      // შევქმნათ ახალი ჩატის დოკუმენტი
      const newChatData = {
        createdAt: now,
        updatedAt: now,
        participants: [user.id, agentEmail],
        participantNames: {
          [user.id]: user.name || user.email || "User",
          [agentEmail]: "Escrow Agent"
        },
        isPrivateEscrowChat: true,
        originalChatId: chatId,
        productId: productId,
        productName: productName || chatData?.productName || "Unknown Product",
        lastMessage: {
          text: "URGENT: I've been tricked/There's a problem with my transaction",
          timestamp: now,
          senderId: user.id
        }
      };
      
      const newChatDoc = await addDoc(newChatRef, newChatData);
      
      // გავაგზავნოთ პირველი შეტყობინება ჩატში
      const messagesRef = ref(rtdb, `messages/${newChatDoc.id}`);
      await push(messagesRef, {
        text: `I need help with my transaction. Issue: "I've been tricked/There's a problem" in chat: ${chatId} for product: ${productName || chatData?.productName || "Unknown Product"}`,
        senderId: user.id,
        senderName: user.name || user.email || "User",
        senderPhotoURL: user.photoURL,
        timestamp: now,
        isSystem: false
      });
      
      // გადავამისამართოთ ახალ ჩატზე
      window.location.href = `/chats/${newChatDoc.id}`;
      
    } catch (error) {
      console.error("Error creating chat:", error);
      alert(`Failed to contact escrow agent. Please try again or contact support directly.`);
    }
  };

  // Message item component displayed in the chat
  const MessageItem = ({ message }: { message: Message }) => {
    const { user } = useAuth();
    const isOwn = message.senderId === user?.id;

    // Check if this is an escrow request message
    const isEscrowRequest = (message.isEscrowRequest || (message.text && message.text.includes("🔒 Request to Purchase")));

    // Special transaction request message
    if (message.isRequest && message.transactionData) {
      const { productName, price, paymentMethod, transactionId, useEscrow } = message.transactionData;
      const isSeller = user?.id !== message.senderId; // If the user is not the sender of the message, they are the seller
      
      return (
        <div className="p-6 mb-4 rounded-xl border-2 border-indigo-200 bg-white shadow-md">
          <div className="flex items-start mb-4">
            <h3 className="text-xl font-bold text-gray-800">Request to purchase <span className="text-blue-600">"{productName}"</span></h3>
          </div>
          
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-2 text-gray-800">
              <div className="flex flex-col">
                <span className="font-medium">Transaction ID: <span className="font-normal">{transactionId}</span></span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Transaction amount: <span className="font-normal">${price}</span></span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Transfer to: <span className="font-normal">{
                  chatData?.sellerId && user?.email !== chatData?.participantNames?.[chatData.sellerId] 
                    ? chatData?.participantNames?.[chatData.sellerId]
                    : message.text && message.text.includes("Transfer to:") 
                      ? message.text.split("Transfer to:")[1].split("\n")[0].trim()
                      : chatData?.participantNames && Object.values(chatData.participantNames)[0] || "seller"
                }</span></span>
              </div>
            </div>
          </div>
          
          {useEscrow && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800">Transaction steps when using the escrow service:</h4>
              </div>
              
              <div className="flex space-x-4 mb-2">
                <div className="w-1/2 h-1 bg-blue-500 rounded-full"></div>
                <div className="w-1/2 h-1 bg-gray-200 rounded-full"></div>
              </div>
              
              <div className="text-sm text-gray-700 space-y-2 mt-4">
                <p><span className="font-medium">1.</span> The buyer pays a 4-8% ($3 minimum) service fee.</p>
                <p><span className="font-medium">2.</span> The seller designates the escrow agent as manager.</p>
                <p><span className="font-medium">3.</span> After 7 days the seller assigns primary ownership rights to the escrow agent (7 days is the minimum amount of time required in order to assign a new primary owner in the control panel).</p>
                <p><span className="font-medium">4.</span> The escrow agent verifies everything, removes the other managers, and notifies the buyer to pay the seller.</p>
                <p><span className="font-medium">5.</span> The buyer pays the seller.</p>
                <p><span className="font-medium">6.</span> After the seller's confirmation, the escrow agent assigns ownership rights to the buyer.</p>
              </div>
            </div>
          )}
          
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 mt-4">
            <div className="font-medium text-blue-800 mb-1">Transaction status:</div>
            {paymentCompleted ? (
              <p className="text-green-700">
                {isSeller ? 
                  "The buyer has paid. Now, you need to designate the escrow agent's account as manager. The escrow agent's email is indicated below. If you don't have a button for transferring administrative rights, that means you have not yet linked the channel with the brand's account. Follow these instructions in order to link your account. " :
                  "You've paid, and we've notified the seller. We're waiting for the seller to designate the escrow agent as manager. The seller has 23:56:08 left to do this, after which we will offer you a refund"
                }
              </p>
            ) : sellerConfirmed ? (
              <p className="text-blue-700">The terms of the transaction have been confirmed. Once the payment is made by either party (as agreed), the other side will be notified and expected to proceed with the next step — including transferring the account credentials in line with the agreed terms. If either party fails to respond or violates the agreement, the escrow agent can be called in using the button below.</p>
            ) : (
              <p className="text-blue-700">Waiting for seller to agree to the terms of the transaction.</p>
            )}
          </div>
          
          {/* Seller view - show confirm button if not yet confirmed */}
          {isSeller && !sellerConfirmed && !paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <button 
                onClick={handleSellerConfirm}
                disabled={confirmingOffer}
                className={`w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all ${confirmingOffer ? 'opacity-80 cursor-not-allowed' : ''}`}
              >
                {confirmingOffer ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    <span>Confirming...</span>
                  </div>
                ) : (
                  "Confirm Offer"
                )}
              </button>
              <div className="mt-2 text-xs text-gray-500">
                By confirming this offer, you agree to the transaction terms and will provide the account details after payment.
              </div>
            </div>
          )}
          
          {/* Input form for payment method selection - visible for both buyer and seller if seller confirmed */}
          {!paymentCompleted && sellerConfirmed && !isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2">
                {/* აქ payment-dropdown-container კლასი გადავიტანეთ უშუალოდ ღილაკის მშობელ div-ზე */}
                <div className="relative w-full payment-dropdown-container"> 
                  <button
                    type="button"
                    onClick={() => setShowPaymentDropdown(prev => !prev)}
                    className={`w-full px-4 py-2 text-sm font-medium border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white text-left flex justify-between items-center ${showPaymentDropdown ? 'rounded-t-lg rounded-b-none' : 'rounded-lg'}`}
                  >
                    {walletAddress ? (walletAddress === 'bitcoin' ? 'Bitcoin' : 'Card') : 'Select payment method'}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  
                  {showPaymentDropdown && (
                    // აქ top-full უზრუნველყოფს, რომ მენიუ ღილაკის ქვემოთ გამოჩნდეს
                    <div className="absolute top-full left-0 right-0 -mt-px bg-white border-l border-r border-b border-gray-300 rounded-b-lg rounded-t-none shadow-lg z-10">
                      <div
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('card');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Card
                      </div>
                      <div
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Bitcoin
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSubmitWalletAddress}
                  disabled={!walletAddress || isSubmittingWallet}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-all"
                >
                  {isSubmittingWallet ? (
                    <div className="flex items-center">
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    'Pay the fee'
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Note: Paying with card will redirect you to Stripe's secure payment page for a fee of 8% of the product price.
              </div>
            </div>
          )}
          
          {/* If payment method is selected but not completed */}
          {!paymentCompleted && isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Payment processing! Transaction will be completed soon.</span>
                </div>
                <div className="pulse-animation">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <style jsx>{`
                .pulse-animation {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .pulse-animation div {
                  animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                  0% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
                  }
                  70% {
                    transform: scale(1);
                    box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
                  }
                  100% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
                  }
                }
              `}</style>
            </div>
          )}
          
          {/* If payment is completed show confirmation */}
          {paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              {/* The following div containing the message will be removed
              <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Payment completed! Transaction process started.</span>
              </div>
              */}
              
              {/* Escrow agent information section is removed from here */}
            </div>
          )}
        </div>
      );
    }
    
    // For escrow request (new format)
    if (isEscrowRequest) {
      // Extract details from message
      const messageLines = message.text.split('\n');
      let transactionId = '';
      let amount = '';
      let paymentMethod = '';
      let productName = '';
      
      // Parse message to extract info
      messageLines.forEach(line => {
        if (line.includes('Transaction ID:')) {
          transactionId = line.split('Transaction ID:')[1].trim();
        } else if (line.includes('Transaction Amount:')) {
          amount = line.split('Transaction Amount:')[1].trim();
        } else if (line.includes('Payment Method:')) {
          paymentMethod = line.split('Payment Method:')[1].trim();
        } else if (line.includes('🔒 Request to Purchase')) {
          // Create the productName from the part after "Request to Purchase"
          productName = line.split('🔒 Request to Purchase')[1].trim();
        }
      });
      
      // Determine if the current user is the seller (not the sender of the escrow request)
      const isSeller = user?.id !== message.senderId;
      
      return (
        <div className="p-6 mb-4 rounded-xl border-2 border-indigo-200 bg-white shadow-md">
          <div className="flex items-start mb-4">
            <div className="mr-2 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800">Request to purchase <span className="text-blue-600">{productName}</span></h3>
          </div>
          
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-gray-800">
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Transaction ID</span>
                <span className="font-medium">{transactionId}</span>
              </div>
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Amount</span>
                <span className="font-medium">{amount}</span>
              </div>
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Payment Method</span>
                <span className="font-medium">{paymentMethod}</span>
              </div>
            </div>
          </div>
          
          <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h4 className="font-medium text-blue-800 mb-3">Escrow Service Process:</h4>
            <ol className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">1</span>
                <span>The buyer pays the cost of the channel + 8% ($3 minimum) service fee.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">2</span>
                <span>The seller confirms and agrees to use the escrow service.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">3</span>
                <span>The escrow agent verifies everything and assigns manager rights to the buyer.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">4</span>
                <span>After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">5</span>
                <span>The funds are then released to the seller. Payments are sent instantly via all major payment methods.</span>
              </li>
            </ol>
          </div>
          
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 mt-4">
            <div className="font-medium text-blue-800 mb-1">Transaction status:</div>
            {paymentCompleted ? (
              <p className="text-green-700">
                {isSeller ? 
                  "The buyer has paid. Now, you need to designate the escrow agent's account as manager. The escrow agent's email is indicated below. If you don't have a button for transferring administrative rights, that means you have not yet linked the channel with the brand's account. Follow these instructions in order to link your account. You have 23:59:30 to do this, after which we will offer the buyer a refund." :
                  "You've paid, and we've notified the seller. We're waiting for the seller to designate the escrow agent as manager. The seller has 23:56:08 left to do this, after which we will offer you a refund"
                }
              </p>
            ) : sellerConfirmed ? (
              <p className="text-blue-700">The terms of the transaction have been confirmed. Once the payment is made by either party (as agreed), the other side will be notified and expected to proceed with the next step — including transferring the account credentials in line with the agreed terms. If either party fails to respond or violates the agreement, the escrow agent can be called in using the button below.</p>
            ) : (
              <p className="text-blue-700">Waiting for seller to agree to the terms of the transaction.</p>
            )}
          </div>
          
          {/* Seller view - show confirm button if not yet confirmed */}
          {isSeller && !sellerConfirmed && !paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <button 
                onClick={handleSellerConfirm}
                disabled={confirmingOffer}
                className={`w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all ${confirmingOffer ? 'opacity-80 cursor-not-allowed' : ''}`}
              >
                {confirmingOffer ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    <span>Confirming...</span>
                  </div>
                ) : (
                  "Confirm Offer"
                )}
              </button>
              <div className="mt-2 text-xs text-gray-500">
                By confirming this offer, you agree to the transaction terms and will provide the account details after payment.
              </div>
            </div>
          )}
          
          {/* Input form for the buyer's payment method selection - only show if payment not completed */}
          {!paymentCompleted && sellerConfirmed && !isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2">
                {/* აქ payment-dropdown-container კლასი გადავიტანეთ უშუალოდ ღილაკის მშობელ div-ზე */}
                <div className="relative w-full payment-dropdown-container"> 
                  <button
                    type="button"
                    onClick={() => setShowPaymentDropdown(prev => !prev)}
                    className={`w-full px-4 py-2 text-sm font-medium border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white text-left flex justify-between items-center ${showPaymentDropdown ? 'rounded-t-lg rounded-b-none' : 'rounded-lg'}`}
                  >
                    {walletAddress ? (walletAddress === 'bitcoin' ? 'Bitcoin' : 'Card') : 'Select payment method'}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  
                  {showPaymentDropdown && (
                    // აქ top-full უზრუნველყოფს, რომ მენიუ ღილაკის ქვემოთ გამოჩნდეს
                    <div className="absolute top-full left-0 right-0 -mt-px bg-white border-l border-r border-b border-gray-300 rounded-b-lg rounded-t-none shadow-lg z-10">
                      <div
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('card');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Card
                      </div>
                      <div
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Bitcoin
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSubmitWalletAddress}
                  disabled={!walletAddress || isSubmittingWallet}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-all"
                >
                  {isSubmittingWallet ? (
                    <div className="flex items-center">
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    'Pay the fee'
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Note: Paying with card will redirect you to Stripe's secure payment page for a fee of 8% of the product price.
              </div>
            </div>
          )}
          
          {/* If payment method is selected but not completed */}
          {!paymentCompleted && isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Payment processing! Transaction will be completed soon.</span>
                </div>
                <div className="pulse-animation">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <style jsx>{`
                .pulse-animation {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .pulse-animation div {
                  animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                  0% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
                  }
                  70% {
                    transform: scale(1);
                    box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
                  }
                  100% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
                  }
                }
              `}</style>
            </div>
          )}
          
          {/* If payment is completed show confirmation */}
          {paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              {/* The following div containing the message will be removed
              <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Payment completed! Transaction process started.</span>
              </div>
              */}
              
              {/* Escrow agent information section is removed from here */}
            </div>
          )}
        </div>
      );
    }
    
    // Regular message
    return (
      <div className={`flex mb-4 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {!isOwn && (
          <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
            {message.isAdmin ? (
              // ამ შემთხვევაში ვაჩვენებთ ადმინის სურათს მესიჯიდან, ან სტანდარტულ agent.png-ს
              <Image 
                src={chatData?.adminPhotoURL || message.senderPhotoURL || "/agent.png"}
                alt="Escrow Agent"
                width={48}
                height={48}
                className="h-full w-full object-cover p-0"
                priority
                onError={(e) => {
                  // თუ სურათის ჩატვირთვა ვერ მოხერხდა, ჩავანაცვლოთ სტანდარტული ავატარით
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.src = '/agent.png';
                }}
                unoptimized
              />
            ) : message.senderPhotoURL ? (
              // ჩვეულებრივი მომხმარებლის ან სისტემური შეტყობინების ფოტო, თუ არის
              <Image 
                src={message.senderPhotoURL} 
                alt={message.senderName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
                priority
                onError={(e) => {
                  // თუ სურათის ჩატვირთვა ვერ მოხერხდა, ჩავანაცვლოთ სტანდარტული ავატარით
                  const target = e.target as HTMLImageElement;
                  target.onerror = null; // თავიდან ავიცილოთ უსასრულო რეკურსია
                  target.src = '/agent.png';
                }}
                unoptimized
              />
            ) : message.isSystem && message.senderName === "System" ? (
              // სისტემური შეტყობინება ფოტოს გარეშე
              <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                S
              </div>
            ) : (
              // სტანდარტული ავატარი მომხმარებლის სახელის პირველი ასოთი
              <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                {message.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
        
        <div 
          className={`max-w-[80%] p-3 rounded-lg shadow-sm ${isOwn 
              ? 'bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-tr-none' 
              : message.isAdmin 
                ? 'bg-green-100 text-green-800 rounded-tl-none border border-green-200' 
                : message.isSystem
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
          }`}
        >
          {!isOwn && !message.isAdmin && !message.isSystem && (
            <div className="text-sm font-medium mb-1 text-indigo-800">{message.senderName}</div>
          )}
          {message.isAdmin && (
            <div className="text-xs font-medium mb-1 text-green-600 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              Escrow Agent
            </div>
          )}
          {message.isSystem && (
            <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              System
            </div>
          )}
          
          <div className="whitespace-pre-wrap break-words">{message.text}</div>
          
          <div className={`text-xs mt-1 text-right ${isOwn ? 'text-indigo-100' : message.isAdmin ? 'text-green-500' : message.isSystem ? 'text-yellow-500' : 'text-gray-400'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        </div>
        
        {isOwn && (
          <div className="h-12 w-12 rounded-full overflow-hidden ml-2 flex-shrink-0 border border-gray-200 shadow-sm">
            {message.isAdmin ? (
              <Image 
                src={chatData?.adminPhotoURL || message.senderPhotoURL || "/agent.png"}
                alt="Escrow Agent"
                width={48}
                height={48}
                className="h-full w-full object-cover p-0"
                priority
                onError={(e) => {
                  // თუ სურათის ჩატვირთვა ვერ მოხერხდა, ჩავანაცვლოთ სტანდარტული ავატარით
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.src = '/agent.png';
                }}
                unoptimized
              />
            ) : message.senderPhotoURL ? (
              <Image 
                src={message.senderPhotoURL} 
                alt={message.senderName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
                priority
                onError={(e) => {
                  // თუ სურათის ჩატვირთვა ვერ მოხერხდა, ჩავანაცვლოთ სტანდარტული ავატარით
                  const target = e.target as HTMLImageElement;
                  target.onerror = null; // თავიდან ავიცილოთ უსასრულო რეკურსია
                  target.src = '/agent.png';
                }}
                unoptimized
              />
            ) : message.isSystem && message.senderName === "System" ? (
              <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                S
              </div>
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                {message.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ჩატის ინტერფეისში დავამატოთ სისტემური შეტყობინების კომპონენტი
  const PaymentStatusMessage = () => {
    // ყველა შემთხვევაში ვაბრუნებთ null-ს, რათა აღარ გამოჩნდეს გადახდის დადასტურების შეტყობინება
    return null;
  };

  const handleSellerConfirm = async () => {
    if (!user || !chatId) return;

    // Display loading/processing state
    setConfirmingOffer(true);

    try {
      const confirmOfferFunction = httpsCallable(functions, 'confirmSellerOffer');
      const result = await confirmOfferFunction({ chatId });
      
      const data = result.data as { success: boolean, message?: string };

      if (data.success) {
        // No need to setSellerConfirmed(true) here directly.
        // The Firestore onSnapshot listener will detect the change in the 'chats' document
        // (specifically the sellerConfirmed field) and update the local state (chatData and subsequently sellerConfirmed).
      } else {
        // Handle potential errors returned from the cloud function even if it's a 'success: false' scenario
        setError(data.message || "Failed to confirm offer. Please try again.");
      }
    } catch (err) {
      const httpsError = err as any; // Type assertion to access HttpsError properties
      if (httpsError.code && httpsError.message) {
        setError(`Error: ${httpsError.message} (code: ${httpsError.code})`);
      } else {
        setError("Failed to confirm offer. Please check your connection and try again.");
      }
    } finally {
      setConfirmingOffer(false);
    }
  };

  // ტაიმერის კომპონენტი
  const TransferTimer = () => {
    // თუ ჩატი არ არის, არ გამოვაჩინოთ ტაიმერი
    if (!chatData) {
      return null;
    }
    
    // ტაიმერი გამოჩნდება მხოლოდ მაშინ, როცა გადახდა დასრულებულია და ტაიმერი აქტიურია
    if (paymentCompleted && timerActive && timerEndDate && remainingTime) {
      const daysNum = remainingTime.days;
      const hoursNum = remainingTime.hours;
      const minutesNum = remainingTime.minutes;
      const secondsNum = remainingTime.seconds;
      
      // აქტიური ტაიმერი - მესიჯის ფორმით
      if (daysNum > 0 || hoursNum > 0 || minutesNum > 0 || secondsNum > 0) {
        return (
          <div className="my-4 p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 max-w-md ml-0 mr-auto">
            <div className="font-medium mb-2 text-center">Account transfer must be completed by:</div>
            <div className="bg-gray-600 rounded-lg shadow-md p-3 mb-1">
              <div className="flex justify-between items-center">
                <div className="text-center px-2 mx-1">
                  <div className="text-white text-base font-bold">{daysNum.toString().padStart(2, '0')}</div>
                  <div className="text-gray-300 text-xs">day</div>
                </div>
                
                <div className="text-center px-2 mx-1">
                  <div className="text-white text-base font-bold">{hoursNum.toString().padStart(2, '0')}</div>
                  <div className="text-gray-300 text-xs">hour</div>
                </div>
                
                <div className="text-center px-2 mx-1">
                  <div className="text-white text-base font-bold">{minutesNum.toString().padStart(2, '0')}</div>
                  <div className="text-gray-300 text-xs">min</div>
                </div>
                
                <div className="text-center px-2 mx-1">
                  <div className="text-white text-base font-bold">{secondsNum.toString().padStart(2, '0')}</div>
                  <div className="text-gray-300 text-xs">sec</div>
                </div>
              </div>
            </div>
            <p className="text-xs mb-1 text-center">
              After this period, the transaction will be completed and the account will be transferred to the buyer.
            </p>
          </div>
        );
      } else {
        // ტაიმერი დასრულდა - მესიჯის ფორმით
        return (
          <div className="my-4 p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 max-w-md ml-0 mr-auto">
            <div className="font-semibold text-green-800 mb-1 text-center">
              Transfer Ready!
            </div>
            <div className="text-sm text-center">
              The 7-day waiting period has passed. The primary ownership rights can now be transferred.
            </div>
          </div>
        );
      }
    } else if (paymentCompleted && !timerActive) {
      // თუ გადახდა დასრულებულია, მაგრამ ტაიმერი არ არის აქტიური:
      // ვაჩვენოთ "დაწყების" ღილაკი მხოლოდ ადმინისთვის.
      // მყიდველისთვის ამ ეტაპზე არაფერი გამოჩნდება.
      if (user?.isAdmin) {
        return null; // მთლიანად წაიშალა დივი ღილაკით
      } else {
        // მყიდველისთვის (არაადმინისთვის) ამ ეტაპზე არაფერს ვაჩვენებთ
        return null;
      }
    }
    
    return null; 
  };
  
  // ტაიმერის დაწყების ეფექტი
  useEffect(() => {
    if (transferTimerStarted && transferReadyTime) {
      // პირველი განახლება დაუყოვნებლივ
      updateRemainingTime();
      
      // შემდგომი განახლებები ყოველ წამში
      intervalRef.current = setInterval(updateRemainingTime, 1000);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [transferTimerStarted, transferReadyTime]);
  
  // ჩატის მონაცემების განახლების ეფექტი
  useEffect(() => {
    if (chatData) {
      // შევამოწმოთ არის თუ არა ტაიმერი დაწყებული Firestore-დან მიღებული მონაცემებით
      if (chatData.transferTimerStarted && chatData.transferReadyTime) {
        setTransferTimerStarted(true);
        setTransferReadyTime(chatData.transferReadyTime);
        // დამატებით, განვაახლოთ timerActive და timerEndDate, რათა TransferTimer კომპონენტმა სწორად იმუშაოს
        setTimerActive(true);
        setTimerEndDate(chatData.transferReadyTime);
        updateTimer(chatData.transferReadyTime); // დავამატოთ remainingTime-ის განახლებაც
      }
      // ასევე შევამოწმოთ ძველი ფორმატის ტაიმერი (timerActive) და განვაახლოთ შესაბამისი სტეიტები
      // ეს მნიშვნელოვანია, თუკი ძველი ჩატები იყენებენ ამ ფორმატს
      else if (chatData.timerActive && chatData.timerEndDate) {
        setTimerActive(true);
        setTimerEndDate(chatData.timerEndDate);
        // თავსებადობისთვის, განვაახლოთ transferTimerStarted და transferReadyTime
        setTransferTimerStarted(true);
        setTransferReadyTime(chatData.timerEndDate);
        updateTimer(chatData.timerEndDate); // დავამატოთ remainingTime-ის განახლებაც
      } else {
        // თუ არცერთი ტაიმერი არ არის აქტიური Firestore-ში, გავასუფთავოთ ლოკალური სტეიტები
        setTimerActive(false);
        setTimerEndDate(null);
        setTransferTimerStarted(false);
        setTransferReadyTime(null);
        setRemainingTime(null); // დავამატოთ remainingTime-ის გასუფთავებაც
      }

      // განვაახლოთ escrowAgentAssigned მდგომარეობა chatData-ზე დაყრდნობით
      // ვვარაუდობთ, რომ 'managerRightsAssigned' არის boolean ველი Chat ტიპში/Firestore დოკუმენტში
      // თუ chatData.managerRightsAssigned არის true, escrowAgentAssigned გახდება true.
      // თუ chatData.managerRightsAssigned არის false ან undefined, escrowAgentAssigned გახდება false.
      setEscrowAgentAssigned(!!chatData.managerRightsAssigned);
    }
  }, [chatData]);
  
  // ეფექტი გადახდის დასრულების შემდეგ ტაიმერის დასაწყებად
  useEffect(() => {
    // აღარ გვჭირდება ავტომატური ტაიმერის დაწყება, რადგან ახლა ტაიმერი იწყება 
    // მხოლოდ ღილაკზე დაჭერით და cloud function-ით ხდება სერვერზე ტაიმერის დაყენება
    // ამ ეფექტის შემცვლელი კოდი მოთავსებულია handleStartTransferTimer ფუნქციაში
  }, [paymentCompleted, chatData]);
  
  // ახალი ტაიმერის განახლება
  useEffect(() => {
    // მხოლოდ მიმდინარე ჩატის ტაიმერის შემოწმება
    if (timerActive && timerEndDate) {
      const updateCurrentChatTimer = () => {
        updateTimer(timerEndDate);
      };
      
      // დაუყოვნებლივ განახლება
      updateCurrentChatTimer();
      
      // ინტერვალის დაყენება ყოველ წამში ერთხელ
      intervalRef.current = setInterval(updateCurrentChatTimer, 1000);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [timerActive, timerEndDate]);
  
  // დავამატოთ ახალი ფუნქცია ტაიმერის დროის განახლებისთვის
  const updateTimer = (endDate: number) => {
        const now = Date.now();
    const remainingMs = Math.max(0, endDate - now);
        
        if (remainingMs <= 0) {
          // ტაიმერი დასრულდა
          setRemainingTime({
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0
          });
          
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
        
        // დარჩენილი დროის გამოთვლა
        const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        
        setRemainingTime({ days, hours, minutes, seconds });
      };
  
  // ტაიმერის დაწყების ფუნქცია
  const handleStartTransferTimer = async () => {
    if (!user || !chatId) return;
    
    try {
      // Set loading state
      setReturningPayment(true);
      
      // გამოვიძახოთ Cloud Function ტაიმერის დასაწყებად
      const startTimerFunction = httpsCallable(functions, 'startTransferTimer');
      const result = await startTimerFunction({
        chatId
      });
      
      // სერვერიდან მიღებული მონაცემები
      const data = result.data as { success: boolean, transferReadyTime: number };
      
      if (data.success) {
        // განვაახლოთ ლოკალური მდგომარეობა სერვერიდან მიღებული მონაცემებით
        setTimerActive(true);
        setTimerEndDate(data.transferReadyTime);
        updateTimer(data.transferReadyTime);
        
        alert("ტაიმერი წარმატებით დაიწყო!");
      } else {
        throw new Error("Failed to start transfer timer on server. Please try again.");
      }
      
    } catch (error) {
      alert(`Failed to start transfer timer: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setReturningPayment(false);
    }
  };
  
  // ეფექტი ადმინის მეილების მისაღებად - აღარ გვჭირდება

  // ადმინის მოწვევის კომპონენტი, რომელიც მხოლოდ გამყიდველისთვის იქნება ხილული
  const AdminInviteComponent = () => {
    // ეს კომპონენტი აღარ იქნება გამოყენებული - დავტოვებთ ცარიელს
    return null;
  };

  // განვაახლოთ სხვა ტაიმერის განახლების ეფექტიც
  useEffect(() => {
    // მხოლოდ მიმდინარე ჩატის ტრანსფერის ტაიმერის შემოწმება
    if (transferTimerStarted && transferReadyTime) {
      const updateTransferTimer = () => {
        updateRemainingTime();
      };
      
      // დაუყოვნებლივ განახლება
      updateTransferTimer();
      
      intervalRef.current = setInterval(updateTransferTimer, 1000);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [transferTimerStarted, transferReadyTime]);

  // ეფექტი ჩამოსაშლელი მენიუს დასახურად გადახდის მეთოდის არჩევისას
  useEffect(() => {
    if (walletAddress) {
      setShowPaymentDropdown(false);
    }
  }, [walletAddress]);

  // ეფექტი ჩამოსაშლელი მენიუს დასახურად გარე კლიკზე
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showPaymentDropdown && !target.closest('.payment-dropdown-container')) {
        setShowPaymentDropdown(false);
      }
      // დავამატოთ იგივე ლოგიკა აგენტის მეილების ჩამოსაშლელი სიისთვის
      if (showAgentEmailDropdown && !target.closest('.agent-email-dropdown-container')) {
        setShowAgentEmailDropdown(false);
      }
      // დავამატოთ ემოჯის არჩევის პანელის დახურვა
      if (showEmojiPicker && !target.closest('.emoji-picker-container') && !target.closest('.emoji-picker-trigger')) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPaymentDropdown, showAgentEmailDropdown, showEmojiPicker]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">{typeof error === 'string' ? error : 'An unexpected error occurred'}</div>
        </div>
      ) : (
        <>
          <div className="overflow-y-auto flex-1 p-4 pb-4 space-y-4">
            {/* დავტოვოთ გადახდის სტატუსის შეტყობინება */}
            <PaymentStatusMessage />

            {/* Timer component - REMOVE FROM HERE */}
            {/* <TransferTimer /> */}

            {/* Messages will be mapped directly here. The parent div (overflow-y-auto) has space-y-4. */}
            {messages.map((message, index) => {
              const isRequestOrEscrowMessage = message.isRequest || message.isEscrowRequest;
              const showEscrowDetailsBlock = paymentCompleted && user && chatData && user.id === chatData.sellerId;
              const hasMoreMessages = messages.length > index + 1;
              return (
                <React.Fragment key={message.id}>
                  <MessageItem message={message} />
                  
                  {/* Show timer after automatic message */}
                  {isRequestOrEscrowMessage && (
                    <TransferTimer />
                  )}

                  {isRequestOrEscrowMessage && showEscrowDetailsBlock && (
                    <div className="md:w-2/3 lg:w-1/2 mr-auto p-3"> {/* Removed bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg shadow-sm */}
                        <div className="text-xs font-medium mb-2 text-yellow-700 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                            Action Required
                        </div>
                        <h3 className="font-medium text-gray-700 mb-3">Escrow Agent Details</h3>
                        <div className="mb-3">
                          <div className="mb-2 relative agent-email-dropdown-container">
                            <label htmlFor="escrowEmail" className="block text-sm font-medium text-gray-700 mb-1">Escrow Agent Email:</label>
                            <input
                              type="email"
                              id="escrowEmail"
                              name="escrowEmail"
                              value={selectedAgentEmail}
                              onChange={(e) => setSelectedAgentEmail(e.target.value)}
                              readOnly={escrowAgentAssigned}
                              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${escrowAgentAssigned ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                              placeholder="Select or type an agent\'s email"
                              onFocus={() => !escrowAgentAssigned && setShowAgentEmailDropdown(true)}
                            />
                            {showAgentEmailDropdown && !escrowAgentAssigned && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                {adminEmailsList.length > 0 ? adminEmailsList.map(agentEmail => (
                                  <div
                                    key={agentEmail}
                                    className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                                    onClick={() => {
                                      setSelectedAgentEmail(agentEmail);
                                      setShowAgentEmailDropdown(false);
                                    }}
                                  >
                                    {agentEmail}
                                  </div>
                                )) : <div className="px-4 py-2 text-gray-500 text-sm">No agents available</div>}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col items-start gap-2">
                          {!escrowAgentAssigned && (
                            <button
                              onClick={handleAssignManagerRights}
                              disabled={assigningManagerRights}
                              className={`px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap ${assigningManagerRights ? 'opacity-80 cursor-not-allowed' : ''}`}
                            >
                              {assigningManagerRights ? (
                                <div className="flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                                  <span>Assigning...</span>
                                </div>
                              ) : (
                                "Assigned manager's rights to the escrow agent"
                              )}
                            </button>
                          )}
                          <button 
                            onClick={handleStartTransferTimer}
                            disabled={returningPayment}
                            className={`px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap ${returningPayment ? 'opacity-80 cursor-not-allowed' : ''}`}
                          >
                            {returningPayment ? (
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                                <span>Processing...</span>
                              </div>
                            ) : (
                              "Return payment to the buyer (cancel the transaction)"
                            )}
                          </button>
                          <button
                            onClick={handleContactEscrowAgent}
                            className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors whitespace-nowrap"
                          >
                            I've been tricked! / There's been some kind of problem contact a live escrow agent
                          </button>
                        </div>
                    </div>
                  )}

                  {isRequestOrEscrowMessage && hasMoreMessages && (
                    <div className="h-[70px]" /> // Changed from h-[100px] to h-[70px]
                  )}
                </React.Fragment>
              );
            })}

            {/* messagesEndRef is now a direct child of the scrollable container */}
            <div ref={messagesEndRef} />

            {/* ადმინის მოწვევის კომპონენტი სრულად წაშლილია */}

          </div>
        </>
      )}

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="bg-white p-4 border-t">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full bg-gray-50 hover:bg-white focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 shadow-sm">
            <div className="relative emoji-picker-container">
              <button
                type="button"
                className="text-gray-400 hover:text-indigo-500 transition-colors emoji-picker-trigger"
                title="Add emoji"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </button>
              {showEmojiPicker && (
                <div 
                  className="absolute bottom-10 left-0 z-10"
                  ref={emojiPickerRef}
                >
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    searchDisabled={false}
                    width={300}
                    height={400}
                    skinTonesDisabled={true}
                  />
                </div>
              )}
            </div>
            
            {/* ბლოკის ლოგოს და ფაილის ატვირთვის ღილაკები წაშლილია */}
            
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write a message..."
              className="flex-1 bg-transparent border-none outline-none placeholder-gray-400 text-gray-800"
            />
          </div>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-3 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white rounded-full hover:shadow-md disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
            title="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
} 