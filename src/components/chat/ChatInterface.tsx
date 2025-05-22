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

interface ChatInterfaceProps {
  chatId: string;
  productId: string;
}

export default function ChatInterface({ chatId, productId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatData, setChatData] = useState<Chat | null>(null);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isSubmittingWallet, setIsSubmittingWallet] = useState<boolean>(false);
  const [isWalletSubmitted, setIsWalletSubmitted] = useState<boolean>(false);
  const [paymentCompleted, setPaymentCompleted] = useState<boolean>(false);
  const [sellerConfirmed, setSellerConfirmed] = useState<boolean>(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState<boolean>(false);
  
  // ახალი state ცვლადები ადმინის მოწვევისთვის და ტაიმერისთვის
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [showAdminEmailDropdown, setShowAdminEmailDropdown] = useState<boolean>(false);
  const [isInvitingAdmin, setIsInvitingAdmin] = useState<boolean>(false);
  const [transferTimerStarted, setTransferTimerStarted] = useState<boolean>(false);
  const [transferReadyTime, setTransferReadyTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState<{days: number, hours: number, minutes: number, seconds: number} | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // ახალი სტეიტები timerActive-ისთვის და ტაიმერის დროებისთვის
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [timerEndDate, setTimerEndDate] = useState<number | null>(null);

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
          console.log("Seller confirmed:", !!data.sellerConfirmed);
          
          // Check payment status
          const isPaymentDone = !!data.paymentCompleted;
          setPaymentCompleted(isPaymentDone);
          console.log("Payment status:", isPaymentDone ? "Completed" : "Not completed");
          
          // ტაიმერის მონაცემების შემოწმება
          if (data.timerActive && data.timerEndDate) {
            setTimerActive(true);
            setTimerEndDate(data.timerEndDate);
            console.log("Timer is active, end date:", new Date(data.timerEndDate).toLocaleString());
          }
          
          // Check if chat has lastMessage
          if (data.lastMessage) {
            console.log("Last message found in Firestore:", data.lastMessage);
          } else {
            console.log("No last message found in Firestore");
          }
          
        } else {
          setError("Chat not found");
        }
      } catch (err) {
        console.error("Error fetching chat data:", err);
        setError("Failed to load chat data");
      }
    };

    fetchChatData();

    // Listen for messages from Realtime Database
    const messagesRef = ref(rtdb, `messages/${chatId}`);
    
    onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      console.log("Firebase RTD Data:", data);
      if (data) {
        const messageList = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...value as Omit<Message, 'id'>
        }));
        
        // Sort messages by timestamp
        messageList.sort((a, b) => a.timestamp - b.timestamp);
        
        console.log("Parsed messages:", messageList);
        setMessages(messageList);
        
        // შევამოწმოთ გადახდის დადასტურების შეტყობინება
        const paymentConfirmationMessage = messageList.find(msg => msg.isPaymentConfirmation);
        if (paymentConfirmationMessage) {
          setPaymentCompleted(true);
          console.log("Payment confirmation message found:", paymentConfirmationMessage);
          
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
      console.error("Error fetching messages:", err);
      setError("Failed to load messages");
      setLoading(false);
    });

    // რეალურ დროში შევამოწმოთ გადახდის სტატუსი ჩატის დოკუმენტის მოთხოვნით
    // ეს საშუალებას გვაძლევს დავინახოთ გადახდის სტატუსის ცვლილებები მყისიერად
    const chatDocRef = doc(db, "chats", chatId);
    const unsubscribeChatDocListener = onSnapshot(chatDocRef, (chatDocSnapshot) => {
      if (chatDocSnapshot.exists()) {
        const updatedChatData = chatDocSnapshot.data() as Chat;
        console.log("Chat document updated (realtime):", updatedChatData);
        
        // განვაახლოთ ჩატის მონაცემები state-ში
        setChatData(updatedChatData);
        
        // შევამოწმოთ გადახდის სტატუსი
        if (updatedChatData.paymentCompleted) {
          setPaymentCompleted(true);
          console.log("Payment status updated to completed from realtime Firestore");
        }
        
        // შევამოწმოთ გამყიდველის დადასტურების სტატუსი და განვაახლოთ
        if (updatedChatData.sellerConfirmed) {
          setSellerConfirmed(true);
          console.log("Seller confirmation updated to true from realtime Firestore");
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
        console.log("Chat lastMessage updated");
      } catch (err) {
        console.error("Error updating chat lastMessage:", err);
      }
      
      setNewMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
    }
  };

  const handleRequestAdmin = async () => {
    if (!user || !chatId) return;

    try {
      // ლოგი
      console.log("Sending admin request for chat:", chatId);
      
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
      
      console.log("Request data:", requestData);
      
      // გაგზავნა
      await push(adminRequestsRef, requestData);
      
      // დადასტურება
      alert("Escrow agent request sent successfully!");
      
    } catch (err) {
      console.error("Error requesting admin:", err);
      setError("Failed to request admin");
      alert("Failed to request escrow agent. Please try again.");
    }
  };

  // Save seller's wallet address
  const handleSubmitWalletAddress = async () => {
    if (!walletAddress) return;

    setIsSubmittingWallet(true);
    try {
      console.log("Processing payment with method:", walletAddress);
      
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
          console.log("Current origin:", origin);

          // სწორი URL-ი HTTPS პროტოკოლით
          const functionUrl = 'https://us-central1-projec-cca43.cloudfunctions.net/createPaymentSessionHttp';
          console.log("Calling function at:", functionUrl);

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
            console.error('Payment API error:', errorData);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
          }
          
          const data = await response.json();
          console.log("Payment session created successfully:", data);
          
          if (!data.url) {
            throw new Error('No checkout URL returned from server');
          }
          
          // გადავამისამართოთ Stripe Checkout გვერდზე
          window.location.href = data.url;
          return; // ვწყვეტთ ფუნქციას, რადგან Stripe checkout გვერდზე გადადის
        } catch (fetchError) {
          console.error("Fetch error:", fetchError);
            
            // დავამატოთ შეტყობინების ჩვენება
          const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
            alert(`Failed to initiate credit card payment: ${errorMessage}. Please try again.`);
            
            setIsSubmittingWallet(false);
            return;
        }
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      
      // დავამატოთ შეტყობინების ჩვენება
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to process payment: ${errorMessage}. Please try again later.`);
      
      setIsSubmittingWallet(false);
    } finally {
      setIsSubmittingWallet(false);
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
                  message.text && message.text.includes("Transfer to:") 
                    ? message.text.split("Transfer to:")[1].split("\n")[0].trim()
                    : "seller@example.com"
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
                The seller has been notified and is now required to provide the agreed login details.
                If the seller fails to deliver or violates the terms, you can request assistance from the escrow agent using the button below.
              </p>
            ) : sellerConfirmed ? (
              <p className="text-blue-700">The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, of breaks the rules, you can call upon the escrow agent (button below).</p>
            ) : (
              <p className="text-blue-700">Waiting for seller to agree to the terms of the transaction.</p>
            )}
          </div>
          
          {/* Seller view - show confirm button if not yet confirmed */}
          {isSeller && !sellerConfirmed && !paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <button 
                onClick={handleSellerConfirm}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
              >
                Confirm Offer
              </button>
              <div className="mt-2 text-xs text-gray-500">
                By confirming this offer, you agree to the transaction terms and will provide the account details after payment.
              </div>
            </div>
          )}
          
          {/* Input form for payment method selection - visible only if seller confirmed, payment is not completed and user is buyer */}
          {!paymentCompleted && !isSeller && sellerConfirmed && !isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2">
                <div className="relative w-full payment-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setShowPaymentDropdown(prev => !prev)}
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white text-left flex justify-between items-center"
                  >
                    {walletAddress ? (walletAddress === 'bitcoin' ? 'Bitcoin' : 'Card') : 'Select payment method'}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  
                  {showPaymentDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                      <div 
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Bitcoin
                      </div>
                      <div 
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('card');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Card
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
                  <span className="font-medium">Payment processing! The seller will be notified soon.</span>
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
              <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Payment completed. The seller has been notified.</span>
              </div>
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
                The seller has been notified and is now required to provide the agreed login details.
                If the seller fails to deliver or violates the terms, you can request assistance from the escrow agent using the button below.
              </p>
            ) : sellerConfirmed ? (
              <p className="text-blue-700">The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, of breaks the rules, you can call upon the escrow agent (button below).</p>
            ) : (
              <p className="text-blue-700">Waiting for seller to agree to the terms of the transaction.</p>
            )}
          </div>
          
          {/* Seller view - show confirm button if not yet confirmed */}
          {isSeller && !sellerConfirmed && !paymentCompleted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <button 
                onClick={handleSellerConfirm}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
              >
                Confirm Offer
              </button>
              <div className="mt-2 text-xs text-gray-500">
                By confirming this offer, you agree to the transaction terms and will provide the account details after payment.
              </div>
            </div>
          )}
          
          {/* Input form for the buyer's payment method selection - only show if payment not completed */}
          {!paymentCompleted && !isSeller && sellerConfirmed && !isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2">
                <div className="relative w-full payment-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setShowPaymentDropdown(prev => !prev)}
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white text-left flex justify-between items-center"
                  >
                    {walletAddress ? (walletAddress === 'bitcoin' ? 'Bitcoin' : 'Card') : 'Select payment method'}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  
                  {showPaymentDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                      <div 
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Bitcoin
                      </div>
                      <div 
                        className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm"
                        onClick={() => {
                          setWalletAddress('card');
                          setShowPaymentDropdown(false);
                        }}
                      >
                        Card
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
                  <span className="font-medium">Payment processing! The seller will be notified soon.</span>
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
              <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Payment completed. The seller has been notified.</span>
              </div>
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
          className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
            isOwn 
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

    try {
      // Update the chat in Firestore to mark that the seller has confirmed
      const chatDocRef = doc(db, "chats", chatId);
      await updateDoc(chatDocRef, {
        sellerConfirmed: true,
        sellerConfirmedAt: Date.now()
      });

      // Update local state
      setSellerConfirmed(true);

      console.log("Seller confirmation completed");
    } catch (err) {
      console.error("Error confirming offer:", err);
      setError("Failed to confirm offer");
    }
  };

  // ტაიმერის კომპონენტი
  const TransferTimer = () => {
    // თუ ჩატი არ არის, არ გამოვაჩინოთ ტაიმერი
    if (!chatData) return null;
    
    // გადახდის დადასტურების შემდეგაც გამოვაჩინოთ ტაიმერი
    if (paymentCompleted) {
      // თუ ტაიმერი აქტიურია, ვაჩვენოთ ის
      if (timerActive && timerEndDate && remainingTime) {
      const { days, hours, minutes, seconds } = remainingTime;
      
      if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
          // ტაიმერი დასრულდა - მესიჯის ფორმით
        return (
            <div className="flex justify-start mb-4">
              <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
                <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                  S
                </div>
              </div>
              <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-tl-none">
                <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
                  System
                </div>
                <div className="font-semibold text-green-800 mb-1">
                Transfer Ready!
            </div>
                <div className="text-sm">
              The 7-day waiting period has passed. The primary ownership rights can now be transferred.
                </div>
                <div className="text-xs mt-1 text-right text-yellow-500">
                  {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            </div>
          );
        }
        
        // აქტიური ტაიმერი გადახდის შემდეგ - მესიჯის ფორმით
        return (
          <div className="flex justify-start mb-4">
            <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
              <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                S
              </div>
            </div>
            <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-tl-none">
              <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                System
              </div>
              <div className="font-medium mb-2">Account transfer must be completed by:</div>
              <div className="bg-gray-600 rounded-lg shadow-md p-3 mb-1">
                <div className="flex justify-between items-center">
                  <div className="text-center px-2 mx-1">
                    <div className="text-white text-base font-bold">{days.toString().padStart(2, '0')}</div>
                    <div className="text-gray-300 text-xs">day</div>
                  </div>
                  
                  <div className="text-center px-2 mx-1">
                    <div className="text-white text-base font-bold">{hours.toString().padStart(2, '0')}</div>
                    <div className="text-gray-300 text-xs">hour</div>
                  </div>
                  
                  <div className="text-center px-2 mx-1">
                    <div className="text-white text-base font-bold">{minutes.toString().padStart(2, '0')}</div>
                    <div className="text-gray-300 text-xs">min</div>
                  </div>
                  
                  <div className="text-center px-2 mx-1">
                    <div className="text-white text-base font-bold">{seconds.toString().padStart(2, '0')}</div>
                    <div className="text-gray-300 text-xs">sec</div>
                  </div>
                </div>
              </div>
              <p className="text-xs mb-1">
                After this period, the transaction will be completed and the account will be transferred to the buyer.
              </p>
              <div className="text-xs mt-1 text-right text-yellow-500">
                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
          </div>
        );
      } else if (!timerActive) {
        // თუ გადახდა დასრულებულია, მაგრამ ტაიმერი არ არის აქტიური - მესიჯის ფორმით
        return (
          <div className="flex justify-start mb-4">
            <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
              <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                S
              </div>
            </div>
            <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-tl-none">
              <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                System
              </div>
              <div className="font-semibold text-blue-700 mb-1">
                Payment Completed
              </div>
              <div className="text-sm">
                Payment has been received and the 7-day account transfer period is starting. The timer will appear here momentarily.
              </div>
              <div className="text-xs mt-1 text-right text-yellow-500">
                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
          </div>
        );
      }
      
      return null;
    }
    
    return null; // შევცვალოთ ტაიმერის აქამდე არსებული კოდი, რომ მესიჯის სახით გამოჩნდეს
  };
  
  // ფუნქცია ტაიმერის განახლებისთვის
  const updateRemainingTime = () => {
    if (!transferReadyTime) return;
    
    const now = Date.now();
    const remainingMs = Math.max(0, transferReadyTime - now);
    
    if (remainingMs <= 0) {
      // ტაიმერი დასრულდა
      setRemainingTime({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      });
      
      // გავწმინდოთ ინტერვალი
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    // გამოვთვალოთ დარჩენილი დრო
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    
    setRemainingTime({ days, hours, minutes, seconds });
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
      // შევამოწმოთ არის თუ არა ტაიმერი დაწყებული
      if (chatData.transferTimerStarted && chatData.transferReadyTime) {
        setTransferTimerStarted(true);
        setTransferReadyTime(chatData.transferReadyTime);
      }
      
      // ასევე შევამოწმოთ ახალი ტაიმერი (7-დღიანი) ამ კონკრეტული ჩატისთვის
      if (chatData.timerActive && chatData.timerEndDate) {
        setTimerActive(true);
        setTimerEndDate(chatData.timerEndDate);
        // გადავუყვანოთ ახალი ტაიმერის მდგომარეობა remainingTime-ში
        updateTimer(chatData.timerEndDate);
      } else {
        setTimerActive(false);
        setTimerEndDate(null);
      }
    }
  }, [chatData]);
  
  // ეფექტი გადახდის დასრულების შემდეგ ტაიმერის დასაწყებად
  useEffect(() => {
    const startTimerAfterPayment = async () => {
      // თუ გადახდა დასრულებულია, ჩატის მონაცემები არსებობს, მაგრამ ტაიმერი არ არის აქტიური
      if (paymentCompleted && chatData && !chatData.timerActive && !timerActive) {
        console.log("Payment completed, starting timer");
        try {
          // დავაყენოთ 7-დღიანი ტაიმერი
          const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
          const endDate = Date.now() + sevenDaysInMs;
          
          // განვაახლოთ ჩატის დოკუმენტი Firestore-ში
          const chatDocRef = doc(db, "chats", chatId);
          await updateDoc(chatDocRef, {
            timerActive: true,
            timerStartDate: Date.now(),
            timerEndDate: endDate
          });
          
          console.log("Timer started successfully. Will end at:", new Date(endDate).toLocaleString());
          
          // განვაახლოთ ლოკალური მდგომარეობა
          setTimerActive(true);
          setTimerEndDate(endDate);
          updateTimer(endDate);
        } catch (error) {
          console.error("Error starting timer after payment:", error);
        }
      }
    };
    
    startTimerAfterPayment();
  }, [paymentCompleted, chatData, chatId, timerActive]);
  
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
  
  // ადმინის მეილების მიღების ფუნქცია
  const fetchAdminEmails = async () => {
    try {
      const getAdminEmailsFunction = httpsCallable(functions, 'getAdminEmails');
      const result = await getAdminEmailsFunction({});
      
      // სერვერიდან მიღებული მონაცემები
      const data = result.data as { adminEmails: string[] };
      setAdminEmails(data.adminEmails || []);
      
      if (data.adminEmails && data.adminEmails.length > 0) {
        // პირველი მეილი ავტომატურად შევარჩიოთ
        setAdminEmail(data.adminEmails[0]);
      }
      
    } catch (error) {
      console.error("Error fetching admin emails:", error);
      setError("Failed to load admin emails");
    }
  };
  
  // ადმინისტრატორის მოწვევის ფუნქცია
  const handleInviteAdmin = async () => {
    if (!adminEmail || !user || !chatId || !chatData) return;
    
    setIsInvitingAdmin(true);
    
    try {
      // გამოვიძახოთ Cloud Function
      const inviteAdminFunction = httpsCallable(functions, 'inviteAdminToPrivateChat');
      
      // შევქმნათ ტრანზაქციის ID
      const transactionId = chatId.substring(0, 6); // გამოვიყენოთ chatId-ის ნაწილი როგორც ტრანზაქციის ID
      const productName = chatData.productName || 'Unknown Product';
      const productPrice = chatData.productPrice || '0';
      
      const result = await inviteAdminFunction({
        chatId,
        adminEmail,
        transactionId,
        productName,
        productPrice,
        initialMessage: `Seller invited you as Escrow Agent for Transaction #${transactionId}` // ახალი პარამეტრი სერვერისთვის
      });
      
      // სერვერიდან მიღებული მონაცემები
      const data = result.data as { success: boolean, privateChatId: string };
      
      if (data.success) {
        // წარმატებული შეტყობინება
        alert("Admin invited successfully! A private chat has been created.");
        
        // ჩავასუფთავოთ მეილის ველი
        setAdminEmail("");
        
      } else {
        throw new Error("Failed to invite admin. Please try again.");
      }
      
    } catch (error) {
      console.error("Error inviting admin:", error);
      alert(`Failed to invite admin: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsInvitingAdmin(false);
    }
  };
  
  // ტაიმერის დაწყების ფუნქცია
  const handleStartTransferTimer = async () => {
    if (!user || !chatId) return;
    
    try {
      const startTimerFunction = httpsCallable(functions, 'startTransferTimer');
      const result = await startTimerFunction({
        chatId
      });
      
      // სერვერიდან მიღებული მონაცემები
      const data = result.data as { success: boolean, transferReadyTime: number };
      
      if (data.success) {
        // ჩატის მონაცემები მოვა ონსნაპშოტიდან, აქ არ ვცვლით ლოკალურ მდგომარეობას
        console.log("Transfer timer started successfully. Will be ready at:", new Date(data.transferReadyTime).toLocaleString());
      } else {
        throw new Error("Failed to start transfer timer. Please try again.");
      }
      
    } catch (error) {
      console.error("Error starting transfer timer:", error);
      alert(`Failed to start transfer timer: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };
  
  // ეფექტი ადმინის მეილების მისაღებად, როცა საჭიროა მათი ჩვენება
  useEffect(() => {
    if (showAdminEmailDropdown && adminEmails.length === 0) {
      fetchAdminEmails();
    }
  }, [showAdminEmailDropdown]);

  // ადმინის მოწვევის კომპონენტი, რომელიც მხოლოდ გამყიდველისთვის იქნება ხილული
  const AdminInviteComponent = () => {
    // შევამოწმოთ არის თუ არა მიმდინარე მომხმარებელი გამყიდველი
    if (!chatData || !user) return null;
    
    // გამყიდველის იდენტიფიკაცია
    const participants = chatData.participants || [];
    let sellerId = chatData.sellerId;
    
    // თუ არ გვაქვს პირდაპირი მითითება, ვცადოთ მონაწილეებიდან გამოცნობა
    if (!sellerId && participants.length >= 2) {
      // თუ ჩატში არის მესიჯები ვიპოვოთ გამყიდველი 
      // ვიმსჯელოთ ესქროუ მესიჯების მიხედვით
      const escrowMessages = messages.filter(msg => 
        msg.isEscrowRequest || (msg.text && msg.text.includes("🔒 Request to Purchase"))
      );
      
      if (escrowMessages.length > 0) {
        // თუ მომხმარებელი არ არის ესქროუ მესიჯის გამგზავნი, ის არის გამყიდველი
        const escrowMessage = escrowMessages[0];
        if (escrowMessage.senderId !== user.id) {
          sellerId = user.id;
        }
      }
    }
    
    // თუ მიმდინარე მომხმარებელი არ არის გამყიდველი, არ ვაჩვენოთ ეს კომპონენტი
    if (sellerId !== user.id) {
      return null;
    }
    
    // ძირითადი ცვლილება: დავამოწმოთ არის თუ არა გადახდა დასრულებული
    // კომპონენტი გამოჩნდება მხოლოდ გადახდის წარმატებით დასრულების შემდეგ
    if (!paymentCompleted) {
      return null;
    }
    
    // შევამოწმოთ არის თუ არა ეს პრივატული ჩატი ან უკვე სამი მონაწილით
    // ამ კომპონენტს მხოლოდ მყიდველი+გამყიდველის ჩატში ვაჩვენებთ
    if (chatData.isPrivateWithAdmin || chatData.isPrivateWithUser) {
      return null; // პრივატული ჩატია, არ ვაჩვენოთ
    }
    
    // შევამოწმოთ მონაწილეების რაოდენობა - უნდა იყოს ზუსტად 2 მონაწილე
    if (participants.length !== 2) {
      return null; // 2-ზე მეტი მონაწილეა, სავარაუდოდ აგენტი უკვე შემოვიდა ჩატში
    }
    
    // გავარკვიოთ უნდა გამოვაჩინოთ თუ არა ეს კომპონენტი (მაგ., თუ ადმინი უკვე შემოვიდა ჩატში)
    if (chatData.adminJoined) {
      return null; // ადმინი უკვე შემოვიდა ჩატში
    }
    
    // თუ უკვე გვაქვს პრივატული ჩატი ადმინთან, არ ვაჩვენოთ მოწვევის კომპონენტი
    if (chatData.hasPrivateAdminChat) {
      return (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700">
          <p className="text-sm">
            You have already created a private chat with an escrow agent. Check your chat list to find it.
          </p>
        </div>
      );
    }
    
    // მხოლოდ კომპონენტის ჩვენება, თუ ყველა პირობა დაკმაყოფილებულია
    return (
      <div className="mb-4 p-4 rounded-lg border border-indigo-100 bg-indigo-50">
        <h3 className="font-semibold text-indigo-800 mb-2">Invite Escrow Agent</h3>
        <p className="text-sm text-indigo-700 mb-3">
          Create a private chat with the escrow agent to discuss the transaction details.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="Enter admin email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              onFocus={() => setShowAdminEmailDropdown(true)}
            />
            
            <button
              type="button"
              onClick={() => setShowAdminEmailDropdown(!showAdminEmailDropdown)}
              className="absolute right-2 top-2 text-gray-500 hover:text-indigo-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            
            {/* ადმინების ჩამონათვალი */}
            {showAdminEmailDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                {adminEmails.length > 0 ? (
                  adminEmails.map((email, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 cursor-pointer hover:bg-indigo-50 text-gray-800 text-sm"
                      onClick={() => {
                        setAdminEmail(email);
                        setShowAdminEmailDropdown(false);
                      }}
                    >
                      {email}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500 text-sm">Loading admin emails...</div>
                )}
              </div>
            )}
          </div>
          
          <button
            type="button"
            onClick={handleInviteAdmin}
            disabled={!adminEmail || isInvitingAdmin}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isInvitingAdmin ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                Inviting...
              </>
            ) : (
              'Invite Admin'
            )}
          </button>
        </div>
      </div>
    );
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
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPaymentDropdown]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">{error}</div>
        </div>
      ) : (
        <>
          <div className="overflow-y-auto flex-1 p-4 pb-4 space-y-4">
            {/* დავტოვოთ გადახდის სტატუსის შეტყობინება */}
            <PaymentStatusMessage />
            
            {/* არსებული მესიჯები - TransferTimer როგორც ცალკე კომპონენტი აღარ გამოვაჩინოთ */}
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            
            {/* Timer as a system message - instead of a separate component */}
            {paymentCompleted && timerActive && timerEndDate && remainingTime && (
              <div className="flex justify-start mb-4">
                <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
                  <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                    S
                  </div>
                </div>
                <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-tl-none">
                  <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    System
                  </div>
                  <div className="font-medium mb-2">Account transfer must be completed by:</div>
                  <div className="bg-gray-600 rounded-lg shadow-md p-3 mb-1">
                    <div className="flex justify-between items-center">
                      <div className="text-center px-2 mx-1">
                        <div className="text-white text-base font-bold">{remainingTime.days.toString().padStart(2, '0')}</div>
                        <div className="text-gray-300 text-xs">day</div>
                      </div>
                      
                      <div className="text-center px-2 mx-1">
                        <div className="text-white text-base font-bold">{remainingTime.hours.toString().padStart(2, '0')}</div>
                        <div className="text-gray-300 text-xs">hour</div>
                      </div>
                      
                      <div className="text-center px-2 mx-1">
                        <div className="text-white text-base font-bold">{remainingTime.minutes.toString().padStart(2, '0')}</div>
                        <div className="text-gray-300 text-xs">min</div>
                      </div>
                      
                      <div className="text-center px-2 mx-1">
                        <div className="text-white text-base font-bold">{remainingTime.seconds.toString().padStart(2, '0')}</div>
                        <div className="text-gray-300 text-xs">sec</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs mb-1">
                    After this period, the transaction will be completed and the account will be transferred to the buyer.
                  </p>
                  <div className="text-xs mt-1 text-right text-yellow-500">
                    {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
              </div>
            )}
            
            {/* Timer ended message */}
            {paymentCompleted && timerActive && timerEndDate && remainingTime && 
             remainingTime.days === 0 && remainingTime.hours === 0 && remainingTime.minutes === 0 && remainingTime.seconds === 0 && (
              <div className="flex justify-start mb-4">
                <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
                  <div className="h-full w-full bg-yellow-500 flex items-center justify-center text-white font-bold">
                    S
                  </div>
                </div>
                <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-tl-none">
                  <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    System
                  </div>
                  <div className="font-semibold text-green-800 mb-1">
                    Transfer Ready!
                  </div>
                  <div className="text-sm">
                    The 7-day waiting period has passed. The primary ownership rights can now be transferred.
                  </div>
                  <div className="text-xs mt-1 text-right text-yellow-500">
                    {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
              </div>
            )}

            {/* Payment completed but timer not active message - ამ შეტყობინებასაც ვშლი */}
            
            {/* ადმინის მოწვევის მესიჯი ჩატში - მესიჯების შემდეგ */}
            {paymentCompleted && chatData && user && ((function() {
              // გამყიდველის იდენტიფიკაცია (იგივე ლოგიკა რაც ადრინდელ AdminInviteComponent-ში)
              const participants = chatData.participants || [];
              let sellerId = chatData.sellerId;
              
              // თუ არ გვაქვს პირდაპირი მითითება, ვცადოთ მონაწილეებიდან გამოცნობა
              if (!sellerId && participants.length >= 2) {
                const escrowMessages = messages.filter(msg => 
                  msg.isEscrowRequest || (msg.text && msg.text.includes("🔒 Request to Purchase"))
                );
                
                if (escrowMessages.length > 0) {
                  const escrowMessage = escrowMessages[0];
                  if (escrowMessage.senderId !== user.id) {
                    sellerId = user.id;
                  }
                }
              }
              
              // არის თუ არა მიმდინარე მომხმარებელი გამყიდველი
              const isSeller = sellerId === user.id;
              
              // ვაჩვენოთ მხოლოდ გამყიდველისთვის
              if (isSeller && !chatData.isPrivateWithAdmin && !chatData.adminJoined && 
                  participants.length === 2 && !chatData.hasPrivateAdminChat) {
                return (
                  <div className="flex justify-end mb-4">
                    <div className="max-w-[90%]">
                      <div className="flex items-start">
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-indigo-100 flex-1">
                          <div className="text-sm font-medium mb-1 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1 text-indigo-600">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                            </svg>
                            <span className="text-indigo-800">System</span>
                          </div>
                          <div className="mb-3">
                            <strong className="text-indigo-800">Invite Escrow Agent</strong><br/>
                            <span className="text-sm text-gray-600">Create a private chat with the escrow agent.</span>
                          </div>
                          
                          <div className="flex flex-col gap-2 mt-2">
                            <div className="relative">
                              <input
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                placeholder="Enter admin email"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                onFocus={() => setShowAdminEmailDropdown(true)}
                              />
                              
                              <button
                                type="button"
                                onClick={() => setShowAdminEmailDropdown(!showAdminEmailDropdown)}
                                className="absolute right-2 top-2 text-gray-500 hover:text-indigo-600"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>
                              
                              {/* ადმინების ჩამონათვალი */}
                              {showAdminEmailDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                                  {adminEmails.length > 0 ? (
                                    adminEmails.map((email, index) => (
                                      <div
                                        key={index}
                                        className="px-3 py-2 cursor-pointer hover:bg-indigo-50 text-gray-800 text-sm"
                                        onClick={() => {
                                          setAdminEmail(email);
                                          setShowAdminEmailDropdown(false);
                                        }}
                                      >
                                        {email}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-gray-500 text-sm">Loading admin emails...</div>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <button
                              type="button"
                              onClick={handleInviteAdmin}
                              disabled={!adminEmail || isInvitingAdmin}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                            >
                              {isInvitingAdmin ? (
                                <>
                                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                                  Inviting...
                                </>
                              ) : (
                                'Invite Admin'
                              )}
                            </button>
                          </div>
                          
                          <div className="text-xs mt-3 text-right text-gray-400">
                            {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                        
                        <div className="h-12 w-12 rounded-full overflow-hidden ml-2 flex-shrink-0 border border-gray-200 shadow-sm">
                          <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                            S
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })())}
            
            <div ref={messagesEndRef} />
          </div>
        </>
      )}

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="bg-white p-4 border-t">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full bg-gray-50 hover:bg-white focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 shadow-sm">
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Add emoji"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </button>
            
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Insert escrow request template"
              onClick={() => {
                setNewMessage(`🔒 Request to Purchase Octopus
Transaction ID: 1736366
Transaction Amount: $12
Payment Method: Stripe
The buyer pays the cost of the channel + 8% ($3 minimum) service fee.

The seller confirms and agrees to use the escrow service.

The escrow agent verifies everything and assigns manager rights to the buyer.

After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.

The funds are then released to the seller. Payments are sent instantly via all major payment methods.`);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </button>
            
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Attach file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>
            
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